---
name: v119 Face-Gate Soft-Pass when Plate-Identity authoritative
description: compose-dialog-segments demotes plate_target_face_missing to a warning when plateIdentityMap.resolvedCount >= speakers.length, then dispatches Sync.so on bbox-url-pro path
type: feature
---

# v119 — Face-Gate Soft-Pass

## Problem
Vier-Personen-Szene 90116518… hatte `plate-identity faces=4 resolved=4/4`, also alle Sprecher sauber auf der gerenderten Plate zugeordnet. Trotzdem hat der strikte Mid-Turn-Frame-Check (`plate_target_face_missing_pass_*`) drei Passes hart geblockt + Refund ausgelöst, weil einzelne probierte Frames den Sprecher kurzzeitig nicht eindeutig zeigten. Sync.so wurde nie aufgerufen.

## Fix
In `compose-dialog-segments/index.ts` direkt nach `Promise.all(gateOne(...))`:

- Wenn `plateIdentityMap.resolvedCount >= speakers.length`, werden alle `face_validation_failed` / `plate_target_face_missing` Ablehnungen zu `v119_face_gate_SOFT_WARN` und der Dispatch läuft normal weiter.
- Passes ohne `reference_frame_number` bekommen einen Fallback-Frame, damit der nachfolgende Builder nicht crasht.
- Echte Failures (keine Plate-Identity oder zu wenige Gesichter) führen weiterhin zu Refund + 422.

## Sync.so-Konformität
Der Dispatch bleibt auf dem `bbox-url-pro`-Pfad (Sync.so Speaker-Selection Docs): pro Pass `options.active_speaker_detection = { auto_detect: false, bounding_boxes_url }` mit echter Plate-BBox aus `plateIdentityMap`. Sync-3 Optionen bleiben doc-strict (`sync_mode` + `active_speaker_detection`).
