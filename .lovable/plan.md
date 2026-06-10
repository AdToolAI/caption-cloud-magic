# Fix: Gemini bekommt MP4 als video_url statt image_url

## Root Cause (empirisch bestätigt)
Gemini lehnt MP4s mit `type: "image_url"` ab (400 "Unsupported image format"), akzeptiert sie aber problemlos mit `type: "video_url"` (200, erkennt 4 Gesichter). Die Replicate-Frame-Extraktion war ein Workaround für den falschen Bug — und ist jetzt kaputt, weil `lucataco/ffmpeg-extract-frame` von Replicate gelöscht wurde.

## Änderungen

### 1. `supabase/functions/validate-frame-face/index.ts`
- Gemini-Call: `type: "image_url"` → `type: "video_url"` (MP4 direkt übergeben)
- Replicate-Frame-Extraktion entfernen (kein Fallback-Pfad mehr nötig)
- Optionaler Timestamp-Hinweis im Prompt: „Analysiere Frame bei t=X.Xs"

### 2. `supabase/functions/_shared/twoshot-face-map.ts`
- Gleiche Änderung: MP4-URL direkt als `video_url` an Gemini, keine Frame-Extraktion mehr

### 3. `supabase/functions/_shared/plate-face-detect.ts`
- Replicate-Aufrufe entfernen, stattdessen MP4 direkt an Gemini via `video_url`
- ~100 Zeilen Code weniger

### 4. Nicht angefasst
- `extract-video-last-frame` und `extract-video-frames` bleiben unverändert (werden für andere Zwecke genutzt, kein Lip-Sync-Blocker)
- v97 fail-fast Logik unverändert
- Stage B (Parallel-Dialog) unverändert

## Verification
Gleiche 4-Sprecher-Szene rendern. Erwartung:
- `plate_identity=on` in den Logs
- `FACE-GATE` mit echten Mund-Koordinaten pro Sprecher
- Sichtbare Mund-Bewegung im Output
- Schneller (kein Replicate-Detour mehr, ~2-3s gespart pro Validierung)

## Risiken
Niedrig — Single-Field-Change pro Call-Site. Falls Gemini bei sehr langen MP4s langsamer wird, können wir später optional einen `videoMetadata.endOffset` Hint hinzufügen.