---
name: v160 sync-3 face-box contract
description: sync-3 bounding_boxes_url must use full face/head boxes; mouth landmarks verify identity but must not shrink boxes to lips-only regions
type: feature
---

# v160 — sync-3 Face-Box Contract

`sync-3` stays the only dialog lip-sync model. For `active_speaker_detection.bounding_boxes_url`, Sync.so expects per-frame face detection boxes (`[x1,y1,x2,y2]` around the visible face/head), not a tiny lips-only mouth box.

## Rule

- Use mouth landmarks as deterministic multi-speaker identity/quality anchors.
- Do **not** center and shrink the dispatched box to the mouth/lips region.
- Dispatch the plate-native face/head bbox with minimal padding.
- Multi-speaker remains fail-closed when the mouth landmark is missing, because that means identity is not precise enough.

## Why

v159 produced `mouth_used=true` but `area_pct=0.14`, which failed the geometry gate and matched Sync.so contract risk: a mouth mini-box does not provide enough full-face context for `bounding_boxes_url`, causing no-lipsync/morph behavior.

## Acceptance logs

- `version=v160`
- `v160_sync3_face_box`
- `mouth_used=true` for multi-speaker
- `v147_BBOX_URL_PRIMARY` with area above the mini-mouth floor instead of `bbox_geometry_insane:area_pct=0.14`