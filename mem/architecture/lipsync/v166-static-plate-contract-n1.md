---
name: v166 Static-Plate Contract (N=1)
description: Cinematic-sync N=1 plates lock the camera (no zoom/push/dolly) so the v163 static face-crop overlay stays aligned with the underlying face; positive prompt also has a camera-motion sanitizer that strips push-in/zoom-in/dolly tokens before composing the plate prompt.
type: feature
---

# v166 — Static-Plate Contract für N=1

## Symptom
Single-speaker Cinematic-Sync Szenen zoomten/pushten leise ins Gesicht rein, und der Lip-Sync sah schon ab Frame 0 verschoben aus (und wurde schlimmer).

## Root Cause
Der v163 Preclip-Pipeline overlay-t den lipgesynchten Face-Crop an **statischen** `(cropX, cropY, cropSize)`-Koordinaten (`CroppedOverlay` in `DialogStitchVideo.tsx`). Driftet die Hailuo-i2v Master-Plate (Push-In / Dolly / leichter Zoom), wandert das Gesicht auf der Plate, der Overlay bleibt eingefroren stehen → Mund-Overlay liegt zunehmend daneben.

Der bestehende `CINEMATIC_SYNC_SILENT_MASTER_NEGATIVE`-Block listet zwar alle Push-Tokens, aber:
- die **v173 N=1 Carve-Out** hatte den positiven LOCK-Suffix bewusst entfernt (damit Performance/Gestik durchkommt),
- und der **User-Scene-Prompt** enthielt häufig "slow push-in" o.ä., was positiv im Plate-Prompt landete und das Negative überschrieb.

## Fix
`supabase/functions/compose-video-clips/index.ts`:

1. **`stripCameraMotionForPlate(text)` Sanitizer** entfernt alle Push-In/Zoom/Dolly/Pan/Tilt/Tracking-Phrasen aus dem positiven Plate-Prompt. Log: `v166_camera_lock_sanitize stripped=[…]`.
2. **`buildCinematicSyncMasterPrompt`** ruft Sanitizer vor dem Zusammenbau auf — gilt für N=1..N.
3. **`neutralTwoShotPrompt(n=1)`** bekommt wieder einen camera-only Lock-Suffix ("LOCKED static camera … no zoom, no push-in, no dolly, no pan, no tilt, no reframing; framing and subject size stay identical from first to last frame; natural body / gesture / head motion still allowed").
4. **N=1 Closing Clause** ersetzt den freien "Camera, framing… follow the scene description faithfully" durch eine explizite Camera-LOCK-Anweisung; Body/Performance bleibt frei.

## Bewusst nicht enthalten
- Drift-Telemetrie (2. Rekognition-Sample am End-Frame) ist als v167 Follow-up vorgemerkt, falls der Static-Lock in Praxis nicht reicht.
- Dynamisches Face-Tracking-Overlay (animierte `left/top/size` in `CroppedOverlay`) bleibt deferred — größerer Remotion-Stitcher-Umbau.

## Akzeptanz
- Re-Run einer 5s N=1 Szene zeigt **statisches** Framing (kein Push-In), Lipsync-Overlay liegt frame-1 wie frame-letzter auf dem Mund.
- `compose-video-clips` Logs enthalten `v166_camera_lock_sanitize` mit den entfernten Tokens, wenn der User-Prompt sie enthielt.
