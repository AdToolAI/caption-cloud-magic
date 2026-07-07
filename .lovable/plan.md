# Ordnungs- und Fixplan: Cast & World + Lipsync Pipeline stabilisieren

## Ziel

Wir stoppen das historische Hin-und-her zwischen Preclip, Coordinates, alten bbox-Pfaden und Name-Matching. Es soll wieder eine klare Architektur geben:

1. **Cast & World ist die Single Source of Truth**: Alles hat stabile IDs.
2. **Briefing Analyse erzeugt/linked Cast & World Assets mit IDs**.
3. **Motion Studio / AI Video Studio verwenden nur IDs als Referenzen**.
4. **Lipsync nutzt genau einen offiziellen Multi-Speaker-Pfad**: Sync.so `sync-3` + `active_speaker_detection.bounding_boxes_url` / `bounding_boxes`, aber sauber pro Sprecher/Turn und nicht als chaotischer Legacy-Fallback.
5. **Keine Morphs durch Pfad-Drift**: alte Full-Plate-Varianten werden entfernt oder hart blockiert, statt zufällig durch Env/Retry wieder aktiv zu werden.

## Aktueller Befund

Die letzte Szene zeigt:

- `dialog_turns = []` → v200 ID-only Resolver greift nicht.
- `_v153BboxPrimary = true` auf allen Pässen → ein alter v153/bbox-primary Pfad lief weiterhin.
- Damit ist nicht v169/v200 aktiv, sondern ein historischer Full-Plate-Pfad.

Dein Bauchgefühl ist richtig: Wir sind nicht sauber auf einer geordneten Pipeline, sondern haben zu viele Versionen nebeneinander.

## Neue Zielarchitektur

```text
Briefing / User Input
        ↓
Cast & World Registry
brand_characters / brand_locations / brand_props / brand_buildings
        ↓
Scene Plan mit IDs
scene_assets + characterShots + dialog_turns(characterId)
        ↓
Plate Generation
Video enthält gewünschte Cast/World-IDs
        ↓
Face / Speaker Map
characterId → bounding box track / frame boxes
        ↓
Sync.so sync-3
bounding_boxes_url pro Sprecher/Turn
        ↓
Final Stitch / Render
nur Zielsprecher wird animiert
```

## Phase 1 — Sofort Ordnung in die aktuelle Lipsync-Pipeline bringen

### 1. Alte Pfade blockieren

In `compose-dialog-segments`:

- v153/v82/v43/v69/v126/v169/v199 Varianten werden nicht weiter als konkurrierende Routen behandelt.
- Der aktuelle Produktpfad wird explizit:
  - `model = sync-3`
  - `active_speaker_detection.bounding_boxes_url` bevorzugt
  - `bounding_boxes` inline nur als technischer Fallback, wenn Upload der JSON fehlschlägt
  - keine `temperature`, keine `occlusion_detection_enabled`, keine Sync.so-unsupported Options
- `FEATURE_V153_BBOX_PRIMARY` wird nicht mehr als stiller Runtime-Rollback akzeptiert. Alte Full-Plate-Primary-Flags dürfen nicht mehr unbemerkt übernehmen.

### 2. ID-only Resolver erzwingen

Vor jedem Compose:

- Wenn `dialog_turns` vorhanden und nicht leer: ausschließlich `dialog_turns[].characterId` verwenden.
- Wenn `dialog_turns=[]`, aber `dialog_script` + `character_shots` existieren: Just-in-time Backfill erzeugen und speichern.
- Wenn Backfill nicht eindeutig ist: Szene failt mit klarer Fehlermeldung, statt Name-Fuzzy-Lipsync zu starten.

Wichtig: Kein stilles Zurückfallen auf Namen, wenn Cast & World IDs vorhanden sein müssten.

### 3. Bounding Boxes korrekt modellieren

Bounding Boxes bleiben der zentrale Weg, aber sauber:

- Pro `characterId` wird eine Box/Track-Quelle bestimmt:
  - bevorzugt aus `scene_face_tracks` / Face Map
  - sonst aus `characterShots[].coords` + vorhandener Plate Identity Map
  - letzter Fallback: deterministische Box um den Speaker Point
- Pro Turn wird eine `bounding_boxes_url` erzeugt:
  - Frames außerhalb des Sprecher-Zeitfensters = `null`
  - Frames im Sprecher-Zeitfenster = Box/Track des Zielsprechers
- Dadurch bekommt Sync.so nicht mehr das Signal, mehrere Gesichter durchgehend zu verändern.

### 4. Fehlerhafte aktuelle Szene zurücksetzen

Für die letzte betroffene Szene:

- `dialog_turns` aus Cast + Script befüllen, wenn eindeutig.
- alte `dialog_shots` / `_v153BboxPrimary` Zustände entfernen.
- Szene auf regenerierbar setzen.

## Phase 2 — Cast & World als Registry aufräumen

### 1. Einheitliches Asset-Referenzmodell

Alle Studio-Prompts und Szenen sollen Referenzen als strukturierte IDs halten:

```ts
{
  type: "character" | "location" | "prop" | "building" | "style",
  id: "uuid",
  role: "speaker" | "background" | "vehicle_driver" | "fighter" | "product" | "setting",
  required: boolean
}
```

Das verhindert, dass dieselbe Figur einmal per Name, einmal per Mention und einmal per Prompttext verwendet wird.

### 2. Cross-Studio-Verwendung

Motion Studio und AI Video Studio lesen dieselben Cast & World IDs:

- Charaktere: `brand_characters.id`
- Locations: `brand_locations.id`
- Props: `brand_props.id`
- Buildings: `brand_buildings.id`
- Outfits / Varianten: eigene Variant-IDs, aber immer parented an Character-ID

### 3. Keine Name-only Prompts mehr intern

Namen dürfen weiterhin sichtbar sein, aber intern wird alles mit IDs gespeichert. Prompttext wird erst beim Provider-Call aus IDs gerendert.

## Phase 3 — Briefing Analyse stabil machen

Die Briefing Analyse soll nicht nur Text ausspucken, sondern Assets strukturieren:

1. Briefing analysieren.
2. Erkannte Personen, Orte, Produkte, Requisiten extrahieren.
3. Gegen Cast & World matchen:
   - exakte ID, wenn vorhanden
   - semantischer Match, wenn wahrscheinlich
   - sonst neues Asset vorschlagen/erstellen
4. Ergebnis als `scene_assets` / Campaign Plan mit IDs speichern.
5. Composer-Szenen übernehmen diese IDs direkt.

Damit wird aus Briefing → Cast & World → Video eine kontrollierte Kette.

## Phase 4 — Bewegungsszenen: Auto, Kampf, komplexe Action

Für Autofahren, Kämpfen, Drehen, Weglaufen reicht eine statische Box nicht dauerhaft.

Dafür wird `scene_face_tracks` aktiviert:

- Nach Plate/Clip-Generation werden Frames gesampled.
- Pro `characterId` wird ein Track erstellt:
  - Frame → Face Box
  - Confidence
  - optional Face Embedding Match gegen Character Reference
- Bounding Boxes für Sync.so kommen dann nicht mehr statisch aus einem Punkt, sondern aus dem Track.

Das ist die Brücke zu „unendlichen Möglichkeiten“, ohne Lipsync zu verlieren.

## Phase 5 — Pipeline-Cleanup und Guardrails

### Entfernen / deaktivieren

- alte retry variants, die Full-Plate ohne saubere Bounding Boxes dispatchen
- Name-Fuzzy Resolver als normaler Pfad
- Env-Rollbacks, die still alte Pfade aktivieren
- doppelte Memories / widersprüchliche Regeln, soweit sie nicht mehr gültig sind

### Hinzufügen

- Dispatch-Log Assertions:
  - `speakers_source = dialog_turns`
  - `model = sync-3`
  - `asd_mode = bounding_boxes_url`
  - `character_id` pro Pass gesetzt
- Hard Fail wenn:
  - Speaker ohne `characterId`
  - kein eindeutiges Cast Asset
  - Bounding Box nicht erzeugbar
  - Sync.so Options nicht doc-strict sind

## Technische Änderungspunkte

### Edge Functions

- `supabase/functions/compose-dialog-segments/index.ts`
  - alte Pfad-Gates entfernen/blockieren
  - sync-3 + bounding_boxes_url als Single Path
  - JIT `dialog_turns` Backfill
  - Hard Fail bei unsicherem Speaker Mapping

- `supabase/functions/compose-video-clips/index.ts`
  - ID-only scene asset handoff
  - keine name-only effectiveShots mehr, wenn IDs verfügbar sind

- `supabase/functions/compose-twoshot-audio/index.ts`
  - Dialog Audio ausschließlich aus `dialog_turns.characterId`, wenn vorhanden

- `supabase/functions/_shared/scene-dialog-turns.ts`
  - Backfill/validation utility zentralisieren

### Database

- Backfill-Migration für Szenen mit leerem `dialog_turns` und vorhandenen `character_shots`.
- Optional: `scene_asset_refs` oder vorhandene JSON-Felder normalisieren, damit Cast & World IDs einheitlich gespeichert werden.
- `scene_face_tracks` bleibt Grundlage für Phase 4.

### Memory / Dokumentation

- Neue Architektur-Memory: „Canonical Lipsync Pipeline — ID + Bounding Boxes“.
- Alte widersprüchliche Lipsync-Memories werden nicht gelöscht, aber als legacy markiert, damit neue Sessions nicht wieder alte Pfade reaktivieren.

## Verifikation

### Kurzer Test

- Bestehende 3-Sprecher-Szene neu rendern.
- Prüfen:
  - `dialog_turns` nicht leer
  - kein `_v153BboxPrimary`
  - Dispatch Log: `sync-3`, `bounding_boxes_url`, `character_id` pro Pass
  - keine Morphs auf inaktiven Gesichtern

### Regression Tests

- 1 Sprecher, 2 Sprecher, 3 Sprecher, 4 Sprecher
- zwei Charaktere mit ähnlichem Namen
- Szene mit Person im Hintergrund
- Szene mit Autofahren / Bewegung als Phase-4-Test

## Ergebnis

Nach Phase 1 ist die aktuelle Morph-/Wrong-Speaker-Schleife beendet.
Nach Phase 2–3 ist Cast & World wieder die zentrale Ordnung.
Nach Phase 4 kann die Pipeline komplexe Action-Szenen tragen, ohne Lipsync zu verlieren.

Das ist kein kosmetischer Patch, sondern ein Cleanup auf eine einzige kontrollierte Produktionspipeline.