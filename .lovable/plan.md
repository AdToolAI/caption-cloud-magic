

## Befund
- AssemblyTab pollt aktuell nur `video_renders.status` — solange `status='rendering'` zeigt es einen Spinner ohne Prozent.
- Es gibt aber bereits eine Edge-Function `check-remotion-progress`, die direkt aus dem Lambda-Progress-Bucket in S3 einen echten `overallProgress` (0..1) liefert. Diese wird vom Composer noch nicht genutzt.
- `invoke-remotion-render` schreibt bereits `real_remotion_render_id`, `lambda_invoked_at`, `bucket_name` in `content_config` — alles, was `check-remotion-progress` braucht. **Backend-seitig keine Änderung nötig.**

## Plan — Echter Ladebalken statt nur Spinner

### 1. Polling im AssemblyTab umstellen
- Statt direkter `video_renders`-DB-Query → `supabase.functions.invoke('check-remotion-progress', { body: { render_id, source: 'composer' } })`
- Antwort liefert `{ progress: { done, overallProgress, outputFile?, fatalErrorEncountered? }, status }`
- State erweitern: `progress: number` (0–100, gerundet)
- Polling-Intervall bleibt 4 s, Timeout-Handling bleibt

### 2. UI: echter Progress-Bar im „rendert …"-Card
Ersetze die aktuelle Spinner-Card durch eine Card mit:
- `<Progress value={progress} />` (existierende shadcn-Komponente)
- Prozent-Label rechts: `{progress}%`
- Status-Text unten: 
  - `0–4%` → „Lambda startet …"
  - `5–94%` → „Frames werden gerendert …"
  - `95–99%` → „Video wird kodiert & hochgeladen …"
- Render-ID weiterhin als kleine Subline
- Spinner bleibt klein neben dem Label

### 3. Render-Button anpassen
- Beschriftung während Render: `Video wird gerendert … {progress}%`
- Bleibt disabled bis fertig

### 4. Robustheit
- Wenn `check-remotion-progress` einen Fehler liefert → einmal still loggen und weiterpollen (kein Abbruch)
- Wenn `done=true` und `outputFile` → wie bisher in `completed`-Branch
- Wenn `fatalErrorEncountered` → in `failed`-Branch mit `errors[0]`

### 5. Translation-Keys (de/en/es)
Neu hinzufügen:
- `videoComposer.lambdaStarting` ("Lambda startet …")
- `videoComposer.framesRendering` ("Frames werden gerendert …")
- `videoComposer.encodingUploading` ("Video wird kodiert & hochgeladen …")
- `videoComposer.renderingPercent` ("Video wird gerendert … {{percent}}%")

## Geänderte Dateien
- `src/components/video-composer/AssemblyTab.tsx` — Polling auf `check-remotion-progress` umstellen, Progress-Bar UI, Button-Label
- `src/i18n/locales/de.json`, `en.json`, `es.json` — neue Keys

## Verify
- „Video rendern" → Progress-Bar füllt sich live von 0 % → 100 %
- Status-Text wechselt von „Lambda startet" über „Frames werden gerendert" zu „Video wird kodiert"
- Render-Button zeigt aktuellen Prozentwert
- Bei Erfolg → Vorschau + Download wie gehabt
- Bei Fehler → konkrete Lambda-Meldung wie gehabt

## Was unverändert bleibt
- DB-Schema (kein neues Feld)
- Backend-Pipeline (`compose-video-assemble`, `invoke-remotion-render`, `remotion-webhook`)
- Mediathek-Auto-Save, Download-Button, Color-Grading, Transitions, Kinetic-Text

