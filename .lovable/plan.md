## Befund

Das eigentliche Problem ist weiterhin dieselbe Kette:

- Die Szene läuft nicht sauber über `Scene-aware Anchor → Master-Clip → v5 Lip-Sync`.
- In den aktuellen Daten wurde v5 Lip-Sync wieder mit einem `talking-head-renders/...mp4` als Videoquelle gestartet.
- Deshalb entsteht ein roher Avatar/Talking-Head statt der im Prompt beschriebenen Szene.
- Der Ladebalken verschwindet, weil die Szene nach einem fehlgeschlagenen/terminalen Zustand nicht mehr als aktive Clips-/Lip-Sync-Arbeit erkannt wird.
- Der dritte Button/Schritt `Voiceover` erscheint, weil die Progress-Logik globales Voiceover als eigene Phase einblendet. Für diesen Cinematic-Sync-Flow ist das falsch: die Audio-Vorbereitung ist nur ein interner Lip-Sync-Schritt, kein eigener Nutzer-Schritt.

Do I know what the issue is? Ja: Es gibt zwei konkrete Ursachen, nicht nur ein UI-Problem.

## Root Cause

1. **Cinematic-Sync Single-Speaker bekommt keinen verlässlichen Anchor**
   - `compose-video-clips` versucht zwar inzwischen auch bei 1 Sprecher einen Anchor zu erstellen.
   - Aber die Szene nutzt `characterId: samuel-dusatko` als Slug, während der Server-Lookup aktuell primär die übergebenen `characters` nach ID nutzt.
   - Dadurch kann `portraitUrls.length` leer bleiben, der Anchor wird übersprungen, und der Master-Clip entsteht ohne komponierte Szenenreferenz.

2. **v5 akzeptiert noch Talking-Head als gültige Quelle, wenn auch `clip_url` selbst schon Talking-Head ist**
   - `compose-dialog-segments` ignoriert zwar eine stale `lip_sync_source_clip_url`, wenn sie auf `talking-head-renders` zeigt.
   - Wenn aber `clip_url` selbst ebenfalls ein Talking-Head ist, wird genau dieser rohe Avatar als Master-Plate verwendet.
   - Das sieht für die Pipeline technisch „fertig“ aus, ist aber semantisch falsch.

3. **HappyHorse-Cinematic-Sync setzt nicht dieselben Schutzfelder wie Hailuo**
   - Der Hailuo-Zweig setzt bei Cinematic-Sync sauber `lip_sync_source_clip_url = null`, `lip_sync_status = pending`, `twoshot_stage = master_clip`.
   - Der HappyHorse-Zweig setzt aktuell nur `clip_status = generating` und lässt alte Lip-Sync-/Talking-Head-Quellen leichter überleben.

4. **Progress-Leiste modelliert den falschen Nutzer-Workflow**
   - Für diesen Flow soll der Nutzer nur `Clips` und `Lip sync` sehen.
   - `Voiceover` ist hier nur `compose-twoshot-audio` innerhalb der Lip-Sync-Pipeline.

## Umsetzungsplan

### 1. Anchor-Erzeugung für Single-Speaker Cinematic-Sync hart absichern

In `supabase/functions/compose-video-clips/index.ts`:

- Slug-IDs wie `samuel-dusatko` zusätzlich über `brand_characters` anhand Name/Slug/User auflösen.
- Falls `characterShots` Portraits nicht über `characters` findet, serverseitig aus der Brand-Character-Library nachladen.
- Für `engineOverride === 'cinematic-sync'` und vorhandenen Dialog/Charakter:
  - Wenn kein Anchor erzeugt werden kann, Szene sichtbar mit `clip_status='failed'` und verständlichem Fehler abbrechen.
  - Nicht still ohne Anchor zu HappyHorse/Hailuo weiterlaufen.

### 2. HappyHorse-Cinematic-Sync auf denselben sicheren Zustand wie Hailuo bringen

In `supabase/functions/compose-video-clips/index.ts` im `ai-happyhorse`-Zweig:

- Bei `engineOverride === 'cinematic-sync'` vor Dispatch:
  - `lip_sync_source_clip_url = null`
  - `lip_sync_status = 'pending'`
  - `twoshot_stage = 'master_clip'`
  - alte `dialog_shots` und stale Sync-IDs bereinigen
- HappyHorse nur mit komponierter `reference_image_url` als I2V starten.
- Wenn keine komponierte Anchor-URL vorhanden ist, nicht als T2V starten.

### 3. v5-Lip-Sync darf niemals auf Talking-Head-Quellen starten

In `supabase/functions/compose-dialog-segments/index.ts`:

- `talking-head-renders` in **beiden** Quellen prüfen:
  - `lip_sync_source_clip_url`
  - `clip_url`
- Wenn beide fehlen oder beide Talking-Head sind:
  - Kein Sync.so-Dispatch.
  - Status bleibt/kehrt in einen klaren Fehlerzustand zurück: `raw_talking_head_source_blocked`.
  - Nutzer sieht „Clip neu rendern“ statt verschwindenden Ladebalken.
- Die Diagnose soll explizit loggen: `source_kind=scene_plate | blocked_raw_talking_head`.

### 4. Server-Fallback darf Lip-Sync erst nach echter Master-Scene starten

In `supabase/functions/compose-clip-webhook/index.ts`:

- Auto-Fallback zu `compose-dialog-segments` nur starten, wenn `clip_url` **nicht** aus `talking-head-renders` kommt.
- Bei Cinematic-Sync zusätzlich sicherstellen, dass `reference_image_url` ein `/scene-anchors/` oder `/composer-anchors/` Bild ist, bevor Lip-Sync automatisch losläuft.

### 5. Progress-Leiste auf den richtigen Flow reduzieren

In `src/hooks/usePipelineProgress.ts` und ggf. `PipelineProgressBar.tsx`:

- Für Szenen mit `engineOverride='cinematic-sync'`/`sync-segments` den Nutzer-Workflow als `Clips → Lip sync` darstellen.
- `Voiceover` nicht als eigene Phase anzeigen, wenn es nur die interne `compose-twoshot-audio`-Vorbereitung ist.
- Audio-Prep weiterhin innerhalb der Lip-Sync-Phase sichtbar halten, z. B. als Label „Audio wird vorbereitet…“.
- Fehlerzustände (`raw_talking_head_source_blocked`, `anchor_missing`, `face_validation_failed`) sollen die Leiste nicht einfach ausblenden, sondern als Fehler sichtbar lassen.

### 6. Bestehende kaputte Szenen bereinigen

Per Datenkorrektur nach Code-Fix:

- Für betroffene Cinematic-Sync-Szenen, deren `clip_url` oder `lip_sync_source_clip_url` auf `talking-head-renders` zeigt:
  - `clip_url = null`
  - `clip_status = 'pending'`
  - `lip_sync_source_clip_url = null`
  - `lip_sync_status = null/pending`
  - `lip_sync_applied_at = null`
  - `dialog_shots = null`
  - `twoshot_stage = null`
  - `replicate_prediction_id = null`
  - `reference_image_url` nur löschen, wenn sie kein echter Scene-Anchor ist
- Danach kann die Szene neu über den korrekten Weg gerendert werden.

## Validierung

Nach Umsetzung prüfe ich:

- Eine Single-Speaker-Cinematic-Sync-Szene erzeugt zuerst einen Scene-Anchor mit sichtbarer Prompt-Umgebung.
- HappyHorse/Hailuo bekommt diese Anchor-URL als Referenzbild.
- `compose-dialog-segments` blockt jede Talking-Head-Quelle zuverlässig.
- Die Progress-Leiste zeigt nur `Clips` und `Lip sync` für diesen Flow.
- Fehler bleiben sichtbar statt dass der Ladebalken verschwindet.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>