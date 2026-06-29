
## Symptom

Single-Speaker Cinematic-Sync Szene zoomt über die 5s langsam ins Gesicht rein („Nahaufnahme"-Effekt), und schon beim ersten Frame sitzt der Lip-Sync nicht richtig auf dem Mund.

## Root Cause

Das Hailuo-i2v Master-Plate macht von sich aus einen leichten Push-In/Dolly. Unsere v163-Preclip-Pipeline berechnet aber einen **statischen** Face-Crop `(cropX, cropY, cropSize)` einmalig aus den hydratisierten Rekognition-Koordinaten am Anfang des Sprecher-Fensters. Das lipgesynchte Square-Crop wird in Remotion (`CroppedOverlay` in `DialogStitchVideo.tsx`) an exakt diesen statischen Koordinaten zurück auf die Plate gemalt.

Während der Push-In läuft, wandert das Gesicht auf der Master-Plate nach vorne/oben — das Lipsync-Overlay bleibt eingefroren stehen. Ergebnis: Mund-Overlay sitzt zunehmend daneben, Sync wirkt sofort falsch und wird schlimmer.

Der bestehende `CINEMATIC_SYNC_SILENT_MASTER_NEGATIVE` Camera-Lock („LOCKED static camera, no zoom, no push-in, no dolly, no pan, no reframing, framing stays identical from first frame to last frame") wird in `supabase/functions/compose-video-clips/index.ts` heute **nur für N≥2 Plates** gesetzt. Der Single-Speaker-Pfad fällt auf den freien User-/Scene-Prompt zurück, der oft cinematische Push-Ins enthält.

## Plan (v166 — Static-Plate Contract für alle N)

### 1. Camera-Lock auf N=1 ausweiten
`supabase/functions/compose-video-clips/index.ts`:
- Den `n>=2`-Branch (~Z. 673) so umstellen, dass der "LOCKED static camera"-Suffix und das `CINEMATIC_SYNC_SILENT_MASTER_NEGATIVE` Negative-Prompt-Block **immer** für cinematic-sync Plates gelten (auch N=1), nicht nur für Multi-Speaker.
- Bestehender Mouth/Idle-Motion-Text bleibt unverändert — Mund-Stille ist weiterhin Voraussetzung für sauberen Sync.

### 2. Push-In Tokens aus dem Scene-Prompt strippen
In demselben File die existierende `stripDialogPatterns`-ähnliche Sanitizer-Logik um Kamera-Bewegungs-Tokens erweitern, bevor der Plate-Prompt gerendert wird:
- Whitelist: `static`, `locked`, `tripod`, `still camera`.
- Strip / move to negative: `push-in`, `push in`, `zoom in`, `dolly in`, `dolly out`, `crane`, `tracking shot`, `pull in`, `move closer`, `reframe`, `slow zoom`.
- Logging: `v166_camera_lock_sanitize stripped=[…]` damit man in `edge_function_logs` sieht, was entfernt wurde.

### 3. Telemetrie: Drift-Sentinel
`supabase/functions/compose-dialog-segments/index.ts`:
- Nach erfolgreicher Face-Detect-Pass für den Preclip ein zweites AWS-Rekognition Sample am letzten Frame des Fensters laufen lassen (1 zusätzlicher Detect-Call, kein neuer Provider).
- Wenn `|Δcenter| / cropSize > 0.25` oder `|Δsize| / cropSize > 0.20` → Log `v166_plate_camera_drift level=warn dx=… dy=… ds=…`. Kein Hard-Fail, nur sichtbar in Logs für künftiges Tuning.

### 4. Akzeptanz
- Re-Run der getesteten 5s Single-Speaker Szene zeigt eine wirklich statische Plate (keine Annäherung mehr) und der Sync-Mund liegt vom ersten bis zum letzten Frame auf dem Plate-Mund.
- `compose-video-clips` Logs enthalten `v166_camera_lock_sanitize` mit den entfernten Tokens.
- Kein neuer Provider, keine Schema-Migration, keine Sync.so-Vertragsänderung.

## Was bewusst NICHT in v166 ist (Follow-up bei Bedarf)

Ein "Dynamic Face Tracking Overlay" (Rekognition pro Sekunde, animierte `left/top/size` in `CroppedOverlay`) wäre die langlebigere Lösung, falls Hailuo trotz Static-Lock noch driftet. Das ist ein größerer Remotion-Stitcher-Umbau und wird erst aufgesetzt, wenn der Drift-Sentinel in echten Runs anschlägt.

## Technische Details

| Datei | Änderung |
|---|---|
| `supabase/functions/compose-video-clips/index.ts` | Camera-Lock + Sanitizer für N≥1 statt N≥2 in cinematic-sync Branch |
| `supabase/functions/compose-dialog-segments/index.ts` | Drift-Sentinel: 2. Rekognition-Sample + `v166_plate_camera_drift` log |
| Remotion-Bundle | unverändert — kein neuer Deploy nötig |
| DB / Migration | keine |
