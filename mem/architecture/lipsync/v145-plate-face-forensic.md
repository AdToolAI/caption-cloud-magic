---
name: v145 Plate-Face-Forensic
description: Empirical diagnostic that proves whether Sync.so face_gate failures come from plate IMAGE CONTENT (Hailuo rendered too few faces) vs Sync.so detection
type: feature
---

## Why
After v143 (rehost) + v144 (NOOP escalation honored), Sync.so dispatches now succeed at HTTP 201, but face_gate still returns `count=0 (after 2 v116 repair attempts)` for 4-speaker dialog plates. We need to know: does the Hailuo plate actually show 4 detectable faces, or does it render a wide composition where mouths are too small for lipsync?

## What
New `mode: "plate-face-forensic"` in `supabase/functions/lipsync-diagnostic/index.ts`:
1. Rehosts plate via shared `rehostPlate` (stable URL)
2. Extracts 3 frames (early ~0.1s / mid / late) via Replicate `lucataco/ffmpeg-extract-frame`
3. Uploads each to `composer-frames` bucket as PNG
4. Asks Gemini 2.5 Pro per frame: count distinct faces with visible mouth area + return (x_pct, y_pct, area_pct, mouth_visible)
5. Writes results into `lipsync_diagnostic_runs.variants` (`id: "frame_early"` etc.) with verdict in `notes`: `plate_face_count_zero` / `_low` / `_ok`

UI: dedicated amber-bordered card on `/admin/lipsync-diagnostic`. No Sync.so burn, ~€0.05 per run.

## Boot
`[lipsync-diagnostic] BOOT v145.0`

## Not changed
- compose-dialog-segments untouched (5800 LOC — needs forensic data first)
- NOOP ladder / webhook untouched
- Server-side face probe still disabled (`server_extract_disabled_use_client_canvas`)

## Next steps after forensic data
If `verdict=plate_face_count_low|zero`: inject "medium close-up group composition, all faces frontal" modifier into Hailuo prompt for speakers >= 3 in compose-scene-anchor.
If `verdict=plate_face_count_ok`: problem is on Sync.so detection side — escalate to bbox-url-pro permanently.
