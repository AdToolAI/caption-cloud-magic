<final-text>## Befund
- Der Fehler passiert aktuell noch **vor** dem eigentlichen Remotion-Render.
- Die Live-Logs von `compose-video-assemble` zeigen eindeutig:
  `PGRST204: Could not find the 'template_id' column of 'video_renders'`
- `compose-video-assemble` schreibt also in ein **falsches Schema** der Tabelle `video_renders`.
- Laut aktueller DB-Typdefinition hat `video_renders` **keine** `template_id`, sondern erwartet Felder wie `format_config`, `subtitle_config`, `user_id`, `render_id`, `content_config`.
- Die anderen Console-Warnings im Screenshot (`X-Frame-Options`, `icon-192.png`) sind nur Nebengeräusche und **nicht** die Ursache.

## Plan
### 1. `compose-video-assemble` an das echte `video_renders`-Schema anpassen
- `template_id` aus dem Insert entfernen
- den Insert an die funktionierenden Render-Pipelines angleichen
- dabei korrekt setzen:
  - `project_id`
  - `user_id`
  - `format_config`
  - `content_config`
  - `subtitle_config`
  - `status`
  - `started_at`
  - `source`
  - optional `bucket_name`

### 2. Lambda-Payload für Motion Studio vollständig machen
Damit nach dem DB-Fix nicht direkt der nächste Renderfehler kommt:
- `width`, `height`, `fps`, `durationInFrames` sauber in den Payload aufnehmen
- `webhook` + `customData` ergänzen
- bei Audio `muted: false` und `audioCodec: 'aac'` setzen
- `outName` pro Render eindeutig machen

### 3. Completion/Fallback für Motion Studio sauber verdrahten
- den Render-Webhook bzw. die Abschlusslogik so erweitern, dass Motion-Studio-Renders auch auf `composer_projects` zurückgeschrieben werden
- bei Erfolg: `status='completed'`, `output_url` setzen
- bei Fehler: `status='failed'`
- optional den Media-Library-Eintrag mit passender Source-Metadaten kennzeichnen

### 4. Fehleranzeige im UI verbessern
In `AssemblyTab.tsx`:
- bei Function-Fehlern die Response aus `error.context.json()` lesen
- echte Backend-Meldung anzeigen statt nur
  `Edge Function returned a non-2xx status code`

## Verify
- Klick auf „Video rendern“ erzeugt keinen 500-Fehler mehr in `compose-video-assemble`
- danach erscheinen Logs in `invoke-remotion-render`
- `video_renders` wird korrekt angelegt
- der Toast zeigt bei Problemen die echte Ursache
- bei erfolgreichem Render bleibt das Projekt nicht auf `assembling` hängen, sondern bekommt eine `output_url`

## Wichtig
- Ich würde **nicht** die DB künstlich um eine `template_id`-Spalte erweitern
- der richtige Fix ist, Motion Studio an das bestehende Render-Schema anzupassen</final-text>