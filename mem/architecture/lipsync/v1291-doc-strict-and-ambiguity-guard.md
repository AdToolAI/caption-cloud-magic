---
name: v129.2.1 Doc-Strict ASD + Ambiguity Guard
description: Multi-Speaker preclip dispatch must use Plate→Preclip doc-strict coords; auto_detect blocked when a sibling face center sits inside the persisted preclip crop
type: feature
---

# v129.2.1 — Doc-Strict ASD + Preclip Ambiguity Guard

**File**: `supabase/functions/compose-dialog-segments/index.ts` (only).

## Rule

For every Multi-Speaker preclip pass (`usePassPreclip && speakers.length >= 2`):

1. **Doc-strict coords** (from v129.1): when persisted plate `coords` and `preclip_crop` exist, transform to preclip-space and send `active_speaker_detection = { auto_detect: false, frame_number, coordinates: [x', y'] }`. Never `auto_detect: true` on Multi-Speaker preclip with coords available.
2. **Ambiguity diagnostic** (v129.2.1): project every other `faceMap.faces` center into plate-space; if it falls inside the `preclip_crop` rect, mark `sibling_centers_inside_crop = true`. Persisted at `meta.v102_probe.preclip_ambiguity = { sibling_centers_inside_crop, siblings_inside, min_neighbor_dist, crop_size, crop_x, crop_y, preclip_face_count, risk }`.
3. **Preflight hard-block** (`DISPATCH_BLOCKED_PAYLOAD_PRECHECK`) fires for any of:
   - `_v1291_block` set (multi-speaker missing coords/crop, or transformed coords OOB)
   - `hasCoords && wouldAutoDetect` (v129.1 contract violation)
   - `wouldAutoDetect && sibling_centers_inside_crop` → `reason = "auto_detect_with_ambiguous_crop"` (v129.2.1 belt-and-suspenders)

  Block path uses existing `failBeforeProviderDispatch` → idempotent refund, no Sync.so call.

## Why this matters

v129.2.0 forensics proved the production bundle was **older than v129.1** (logs showed `stage = "preclip-sync3-auto-detect-v115"`, a string no longer in source). v129.2.1 ships together with the v129.1 doc-strict branch and adds the ambiguity guard for layouts where the 220 px floor in `computeFaceCrop` pulls a vertically adjacent sibling into the crop (Samuel/Sarah, Samuel/Kailee 2x2 stacks).

## Out of scope

`computeFaceCrop` is **not** changed (no floor edit, no `MIN_VIABLE_SYNC_CROP_PX`). State machine, retry, watchdog, plan-D, UI, lipsync-2-pro, Stage 4 A/B, segments, `bounding_boxes_url` promotion all untouched. Crop-safety guard is v129.2.2; stack strategy is v129.3.

## Verification

```sql
SELECT meta->'v102_probe'->>'stage' AS stage,
       meta->'v102_probe'->>'asd_mode' AS asd_mode,
       meta->'v102_probe'->'preclip_ambiguity'->>'risk' AS amb_risk,
       count(*)
FROM syncso_dispatch_log
WHERE created_at > now() - interval '24 hours'
GROUP BY 1,2,3 ORDER BY 4 DESC;
```

Expected for Multi-Speaker scenes post-deploy: `stage = "preclip-sync3-v1291"`, `asd_mode = "preclip_coords_doc_strict"`, `amb_risk ∈ { "clean", "neighbor_inside_crop" }`. Any `DISPATCH_BLOCKED_PAYLOAD_PRECHECK` with `reason = "auto_detect_with_ambiguous_crop"` indicates the guard saved a wasted Sync.so call.
