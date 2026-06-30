---
name: v181 N=1 Depicted-Face Lock
description: Strict bbox lock for single-speaker scenes when a secondary face is depicted in the plate (phone, photo, mirror, background person)
type: feature
---

# v181 — N=1 Depicted-Face Lock

## Problem

For single-speaker (N=1) scenes Sync.so's Active Speaker Detection can lock onto a more "lip-active" depicted face — phone screen, framed photo, mirror reflection, background person — and leave the cast member static with only idle mouth motion. v175+ already dispatches `bbox-url-pro` with a plate-native cast box, but the strategy layer (`_shared/asd-strategy.ts`) had no explicit rule for "N=1 + multi-face plate".

## Fix (additive)

### `supabase/functions/_shared/asd-strategy.ts`
- New `AsdMode`: `single_face_bbox_strict`.
- New `PassGeometry` fields: `plateFaceCount` (number of faces in the FULL plate) and `castSpeakerPlateBox` (plate-native cast bbox).
- New Rule 4 branch, fires BEFORE the existing `single_face_auto`:
  - When `!isMultiSpeaker && plateFaceCount >= 2 && castSpeakerPlateBox` set, and not in a coords-pro / bbox-url retry → return strict single-entry `bounding_boxes: [castBox]`, `auto_detect:false`.
  - Diagnostics tag `v181_n1_depicted_face_lock: true`.
- Rule 0/1/2/3/5 and multi-speaker paths untouched.

### `supabase/functions/compose-dialog-segments/index.ts`
- At the v153 unified-bbox decision (`_v153BboxPrimary=true`), emit a v181 telemetry log when `speakers.length===1 && plateIdentityMap.faces.length >= 2`, and set `pass._v181DepictedFaceLock=true` for downstream diagnostics. No dispatch behavior change — the existing bbox-url-pro path already pins Sync.so to the cast box; v181 just makes the lock observable and asserts a new strategy mode for callers that hand off to `buildAsdStrategy()`.

### Tests
`supabase/functions/_shared/asd-strategy.test.ts` — 2 new tests, total 27 passing.

## Untouched

HappyHorse/Hailuo plate generation, Anchor pipeline (v168/v170), Sync.so webhook & watchdog, audio mux, refund logic, briefing→storyboard mapping, voice pool, multi-speaker paths (Rule 2/3).
