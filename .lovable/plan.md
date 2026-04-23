
## Problem

Im finalen Render erscheint Text wie „Content-Erstellung war noch nie so einfach!", obwohl der User **nie Subtitles oder Text-Overlays aktiviert** hat (Screenshot bestätigt: beide Toggles OFF).

## Ursache (echter Bug, nicht UI-Transparenz)

Es gibt **drei** unabhängige Mechanismen im Renderer, die Text einbrennen können:

| # | Quelle | Toggle respektiert? |
|---|--------|---------------------|
| 1 | `subtitles.enabled` + `subtitles.segments` | ✅ Ja |
| 2 | `globalTextOverlays` (mit `textOverlaysEnabled`) | ✅ Ja |
| 3 | **Per-Szene `text_overlay`** (DB-Spalte, legacy) | ❌ **NEIN** |

**Der Schuldige ist #3.** Die Storyboard-Generation (`compose-video-storyboard/index.ts`) befüllt für jede Szene das Feld `textOverlayText` mit einem Hook/CTA und speichert es in `composer_scenes.text_overlay`. Der Render-Backend (`compose-video-assemble/index.ts:214-221`) liest diese DB-Spalte und reicht sie **ungefiltert** als `scene.textOverlay` an Remotion weiter. Das `<Scene>`-Component (`ComposedAdVideo.tsx:287`) brennt den Text ein — **komplett unabhängig** vom `textOverlaysEnabled`-Schalter.

Es gibt zwar eine Migration in `VoiceSubtitlesTab.tsx:337-386`, die Legacy-Overlays nach `globalTextOverlays` kopiert. Aber sie **leert das alte `text_overlay`-Feld in der DB nicht**, deshalb bleibt der Text dauerhaft im Render.

## Plan

### 1. Renderer-Backend: per-Szene Text-Overlay nur senden, wenn Toggle aktiv
**Datei:** `supabase/functions/compose-video-assemble/index.ts` (Zeile 214-221)

`scene.textOverlay` nur dann an Remotion übergeben, wenn:
- `assemblyConfig.textOverlaysEnabled !== false` UND
- `s.text_overlay.text` ein nicht-leerer String ist

```ts
const overlaysFeatureEnabled = assemblyConfig.textOverlaysEnabled !== false;
// ...
textOverlay: (overlaysFeatureEnabled && s.text_overlay?.text?.trim())
  ? { text: s.text_overlay.text, position: ..., ... }
  : undefined,
```

Damit ist der globale Toggle die einzige Source of Truth für **alle** Text-Mechanismen.

### 2. Storyboard-Generation: Default `textOverlayText = ""` für alle Kategorien
**Datei:** `supabase/functions/compose-video-storyboard/index.ts`

Aktuell wird der Hook nur für `storytelling` zwingend leer erzwungen. Erweitern wir das zur **opt-in-Logik**: Standardmäßig erzeugt die Pipeline keine eingebrannten Hooks mehr — User muss aktiv einen Text-Overlay im Voice & Subtitles Tab anlegen. Das verhindert den Bug an der Wurzel.

Konkret: System-Prompt anpassen — `textOverlayText: ""` für **alle** Kategorien als Default. User kann später über den Studio-Editor Texte einfügen.

### 3. Migration aufräumen: Legacy `text_overlay` nach Migration leeren
**Datei:** `src/components/video-composer/VoiceSubtitlesTab.tsx` (Zeile 364-385)

Nach der erfolgreichen Migration zu `globalTextOverlays` zusätzlich für jede Szene `textOverlay = { text: '', ... }` setzen, damit das DB-Feld geleert wird und der Renderer kein Doppel-Rendering machen kann.

### 4. Bestehende Drafts heilen (DB-Migration)
Einmalige SQL-Migration: Alle `composer_scenes.text_overlay` Felder mit `text: ""` neutralisieren, deren zugehöriges Projekt `assembly_config.textOverlaysEnabled = false` hat.

```sql
UPDATE composer_scenes cs
SET text_overlay = jsonb_set(text_overlay, '{text}', '""'::jsonb)
WHERE cs.project_id IN (
  SELECT id FROM composer_projects 
  WHERE (assembly_config->>'textOverlaysEnabled')::boolean = false
     OR assembly_config->>'textOverlaysEnabled' IS NULL
)
AND text_overlay->>'text' != '';
```

## Erwartetes Ergebnis

- Wenn `textOverlaysEnabled` OFF und `subtitles.enabled` OFF → finaler Render **garantiert ohne Text**, Captions, Hooks oder CTAs
- WYSIWYG-Parität wiederhergestellt: Preview ohne Text → Render ohne Text
- Standardmäßig erzeugt die Storyboard-KI keine eingebrannten Hooks mehr
- Bestehende fehlerhafte Drafts werden durch SQL-Migration repariert

## Technische Details

**Geänderte Dateien (3):**
- `supabase/functions/compose-video-assemble/index.ts` — `scene.textOverlay` nur senden wenn Toggle on
- `supabase/functions/compose-video-storyboard/index.ts` — Default-leer für alle Kategorien
- `src/components/video-composer/VoiceSubtitlesTab.tsx` — Migration leert auch DB-Feld

**Datenbankmigration (1):** SQL-Update gegen `composer_scenes.text_overlay`

Edge Functions werden automatisch deployed. Verifikation: Bestehendes fehlerhaftes Projekt erneut rendern → Render kommt ohne „Content-Erstellung war noch nie so einfach!" zurück.
