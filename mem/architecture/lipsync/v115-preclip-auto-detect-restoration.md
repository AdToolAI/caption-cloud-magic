---
name: v115 Preclip Auto-Detect Restoration
description: Single-face preclip dispatch reverts to auto_detect:true (Sync.so doc-correct path) instead of v114 center coordinates; coords_center kept only as fallback when preclip_face_count != 1
type: feature
---

# v115 — Preclip Auto-Detect Restoration

## Decision

When the preclip face-gate has validated **exactly one face** in the 720p+ single-face crop, dispatch to Sync.so with `active_speaker_detection: { auto_detect: true }`. Drop `frame_number` / `coordinates` entirely.

## Why

Official Sync.so guidance (https://sync.so/docs/developer-guides/speaker-selection):

> "Auto-detect (video only): fastest setup; best for single/obvious speaker clips. Set auto_detect: true and skip manual fields."

Our preclip path is exactly this case: a tight square crop containing one validated face.

v114 (center coordinates on the preclip) was an over-correction. DB-confirmed on scene `7470be0d-5b7e-4df5-9871-152864e0a858` pass 2 (Matthew): coords_center on a validated single-face preclip returns `provider_unknown_error` from Sync.so reproducibly.

## Rules

- `usePassPreclip === true` AND `preclip_face_count === 1` → `auto_detect: true`, no coordinates.
- `usePassPreclip === true` AND `preclip_face_count !== 1` (validator skipped or anomalous count) → fallback to `coords_center` at frame 0 (geometric middle).
- Sync-3 payload remains doc-strict: only `sync_mode` + `active_speaker_detection`. `temperature` and `occlusion_detection_enabled` MUST be stripped.
- Retry ladder `RETRY_VARIANTS` still includes `coords-pro` / `sync3-coords` as targeted fallbacks if `auto_detect` itself fails for a specific preclip.

## What v115 does NOT change

- Full-plate multi-speaker path: still uses `bbox-url-pro` / `coords-pro` (NEVER blind `auto_detect:true` on multi-face full plates — that guardrail in v108 stays).
- Preclip face-gate, crop computation, 720p floor (v112), no-op detection (v113) all stay.

## Future (not yet implemented)

- Phase 2: Official Sync.so Segments API as primary path for multi-speaker (1 video + N audio + per-segment ASD) instead of fan-out + mask compositing.
- Phase 3: Plate-quality gate before lip-sync dispatch.
