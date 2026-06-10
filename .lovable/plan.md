# Welle D – Lipsync Static-Frame Fix

## Problem
Sync.so `sync-3` mit `auto_detect:true` liefert für Sprecher 2+3 ein eingefrorenes 1:1-Copy des Inputs zurück, weil ihre Preclip-Crops nahezu statisch sind (Frame-Diff 0.4–1.1 px vs. Sarah 8–11 px). Audio läuft korrekt, aber Mund bleibt zu.

## Lösung in 3 Hebeln

### Hebel 1 – Source Motion (compose-dialog-scene + Hailuo-Prompts)
- In `compose-dialog-scene/index.ts` Hailuo-Plate-Prompt erweitern: jeder Cast-Member bekommt zusätzlich Zeile `"<Name> visibly breathing, subtle head idle motion, mouth slightly parted, never fully static"`.
- Sichert minimale Bewegung pro Sprecher → Sync.so erkennt Face auch ohne explizite Koords.

### Hebel 2 – Sync.so Settings (dispatch-syncso-pass)
- `auto_detect: true` → ersetzen durch explizite `bounding_box` aus `face_map[speakerId]` pro Pass (FaceMap existiert bereits in `composer_scenes.face_map`).
- `temperature: 0.7` → `1.0` (mehr Mund-Bewegung erlaubt).
- `occlusion_detection_enabled: true` zusätzlich setzen.

### Hebel 3 – Static-Frame Fallback (dispatch-syncso-pass + poll-dialog-shots)
- Nach jedem Pass: in `poll-dialog-shots` Frame-Diff-Check auf erste 30 Frames des Pass-Outputs.
- Wenn mean-diff < 2.0 px → markiere Pass als `static_frozen`, retry automatisch mit `model: "lipsync-2-pro"` + explizite Koords + `temperature: 1.0`.
- Max 1 Retry pro Pass, danach hard fail mit Refund.

## Migration
- Neue Spalte `composer_scenes.lipsync_passes[].static_retry_count` (default 0).
- Kein neuer Bucket nötig, FaceMap wird wiederverwendet.

## Test
- Manueller Re-Run auf Scene `e451083e-2c89-46e9-8228-8164583167f2` via `compose-dialog-scene` mit `force_remux=true`.
- Erwartung: Sarah unverändert OK; Matthew + Samuel bewegen Mund sichtbar.
- Acceptance: alle 3 Sprecher haben Frame-Diff > 3 px im Mundbereich während ihres Turns.

## Rollout
- Feature-Flag `dialog_static_retry_enabled` default **on**.
- Falls Regression: Flag off → alter Pfad.
- Kein User-Reset nötig, alter Mux-Pipeline bleibt fallback.

## Out of Scope
- Welle C (segments-native) bleibt verworfen.
- Single-Speaker Pfad unverändert.
- Cinematic-Sync / HeyGen unverändert.
