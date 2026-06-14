## Befund

Wir haben tatsächlich etwas Entscheidendes übersehen: Die Pipeline glaubt, sie rendert Preclips mit `outputSize: 720`, aber die echten Dateien, die Sync.so bekommen hat, sind weiterhin **512×512**.

Beleg aus dem aktuellen Run `3da688ef-e467-45e7-a6a7-503c1432270a`:
- `dialog_shots.passes[*].preclip_crop.outputSize = 720`
- `video_renders.format_config.width/height = 720`
- aber `ffprobe` auf die echten Preclip-URLs zeigt: **512×512**
- Sync.so-Outputs sind ebenfalls **512×512** und unterscheiden sich nur minimal vom Input (`mean_diff ~1–2`) → praktisch No-op / kaum sichtbare Mundbewegung

Ursache im Code:
- `pass-face-preclip.ts` berechnet zwar `outputSize: 720`, gibt diesen Wert aber **nicht** an die Remotion-Komposition weiter.
- `DialogTurnFaceCropVideo` / `Root.tsx` fällt dadurch auf `outputSize`-Fallback **512** zurück.

Zusätzlich bestätigt die offizielle Sync.so-Doku:
- mindestens **480p** für zuverlässige Face Detection, empfohlen **1080p**
- AI-generierte Videos sollen enthalten: `"the character should be speaking naturally"`
- bei mehreren Personen: Speaker Selection oder Segments API nutzen; `auto_detect` ist nur für single/obvious speaker ideal

## Plan v113

### 1. Preclip-Auflösung wirklich auf 720p bringen

Ändern:
- `supabase/functions/_shared/pass-face-preclip.ts`
  - `outputSize` in `inputProps` aufnehmen.
- `src/remotion/templates/DialogTurnFaceCropVideo.tsx`
  - Schema um `outputSize` erweitern, damit die Komposition den Wert sauber akzeptiert.
- `src/remotion/Root.tsx`
  - vorhandene `calculateMetadata`-Logik beibehalten, aber sicherstellen, dass `props.outputSize` zuverlässig aus dem Payload kommt.

Ziel:
- Echter Preclip muss per `ffprobe` **720×720** oder größer sein, nicht nur DB-Metadata.

### 2. Harte Preclip-Verifikation vor Sync.so-Dispatch

Nach `renderPassFacePreclip`:
- echte Video-Dimensionen über vorhandene Probe/ffprobe-ähnliche Helfer prüfen.
- wenn `< 480px`: nicht an Sync.so schicken.
- wenn `< 720px`: als Regression loggen und fail-safe blocken oder neu rendern.

Damit verhindern wir, dass DB-Metadata wieder grün aussieht, obwohl Sync.so effektiv zu kleine Inputs bekommt.

### 3. Sync.so No-op-Erkennung im Webhook

In `sync-so-webhook` bei `COMPLETED`:
- Input-Preclip und Sync.so-Output vergleichen:
  - Dimensionen
  - Dauer
  - optional mehrere Frames im Mund-/Facebereich per Pixel-Diff
- wenn Output fast identisch zum Input ist:
  - Pass nicht als erfolgreich werten
  - `sync_output_unchanged: true` speichern
  - Retry/Fallback auslösen statt finalen Mux zu bauen

Das ist wichtig, weil Sync.so bei solchen Fällen `COMPLETED` liefern kann, obwohl visuell nichts passiert.

### 4. Fallback-Strategie doc-konform verbessern

Wenn ein Preclip trotz 720p als No-op zurückkommt:
- erster Retry: Full-plate `sync-3` mit `segments[]` + `optionsOverride.active_speaker_detection` pro Segment prüfen/verwenden, statt weiter blind einzelne No-op-Preclips zu muxen.
- Grund: Sync.so-Doku beschreibt Segments offiziell für Multi-Speaker und pro Segment andere Speaker-Selection.
- `auto_detect` bleibt nur für echte single-face Preclips; für Multi-Face/Segment-Fallback nutzen wir deterministische `coordinates`/`frame_number` oder `bounding_boxes_url`.

### 5. Overlay/Mux absichern

In `render-sync-segments-audio-mux` / `DialogStitchVideo`:
- sicherstellen, dass 720p Sync-Outputs wieder korrekt auf den ursprünglichen Crop `x/y/size` skaliert werden.
- Log erweitern: `output_url`, `crop`, `preclip_input_dims`, `sync_output_dims`, `shot window`.

### 6. Betroffene Szenen sauber resetten

Für die zuletzt getesteten Szenen:
- `dialog_shots`, `lip_sync_status`, `twoshot_stage`, `clip_url` resetten.
- vorhandene 512×512 Preclip-URLs verwerfen.
- Master-Plate/Anchor nur neu rendern, wenn sie noch vor dem `speaking naturally` Prompt erzeugt wurde.

### 7. Deployment & Verifikation

Deploy:
- `compose-dialog-segments`
- `sync-so-webhook`
- `render-sync-segments-audio-mux`
- Remotion Bundle neu deployen, weil `DialogTurnFaceCropVideo`/`Root.tsx` geändert werden.

Verifikation am nächsten Run:
- `ffprobe(preclip) = 720×720`
- Sync.so-Output ist nicht nahezu identisch zum Preclip
- Mux-Shots verwenden 4 sichtbare Crop-Overlays
- Finalclip zeigt Mundbewegung in den jeweiligen Sprecherfenstern

## Nicht ändern

- Kein Entfernen von `auto_detect` auf echten single-face Preclips.
- Kein Zurück zu `temperature` oder `occlusion_detection_enabled` bei `sync-3`.
- Kein weiterer Prompt-only-Fix als alleinige Maßnahme — der aktuelle Beweis zeigt einen technischen Render-/Payload-Fehler.