---
name: v122 — Coords-as-Preclip-Truth
description: Per-pass preclip must contain the speaker's coords; bbox drift is auto-rejected and re-rendered coords-centered; mux ignores stale preclip_crop that doesn't contain coords
type: feature
---

## Symptom (pre-fix)
Multi-speaker dialog scenes (3–4 speakers) returned a final mux where only the LAST speaker actually moved their mouth. Other speakers stayed closed-lipped. DB inspection of `composer_scenes.dialog_shots.passes[]` showed `preclip_crop` centers up to 300 px away from the pass's own `coords` — i.e. Sync.so received a square crop of a NEIGHBOR'S face, animated that mouth, and the audio-mux Lambda dutifully overlaid that crop back at `preclip_crop.x/y` (the wrong screen location). The real speaker's face at `coords` was never touched.

## Root cause
`compose-dialog-segments/index.ts` (line ~2495) builds `bboxForCrop` from either the face-map (matched by `character_id` / `slotIndex`) or `speakerPlateBboxes[speaker_idx]`. When that bbox drifts or is mis-assigned to a neighbor, `computeFaceCrop(coords, bbox, …)` ends up size-derived from the drifted bbox and — due to clamp interactions — can land far from `coords`. The face-gate then validated "exactly 1 face in preclip" (which is true: the NEIGHBOR's face) and dispatched it.

## Fix (v122)

### `supabase/functions/compose-dialog-segments/index.ts`
- After `renderPassFacePreclip`, check `coords ∈ inner 70%` of returned crop.
- If outside AND `bboxForCrop` was provided → log `v122_bbox_drift_rejected`, set `preclip_bbox_drift_rejected=true`, re-render once with `bbox=null` (forces coords-centered square crop).
- Pass preclip-local normalized coords to `validateFrameFace` as `targetCoords`. If `coordsMatch === false` → treat as `face_gate_failed:coordsMatch=false`.

### `supabase/functions/render-sync-segments-audio-mux/index.ts`
- Defense in depth: if `coords` is NOT inside the stored `preclip_crop` rectangle, ignore the crop overlay and fall back to the coords-centered circular `faceMask`. Logs `v122_preclip_coords_outside_crop`. Lets historical scenes with bad preclip_crop be re-muxed without re-rendering all passes.

## Invariants
- For every `done` pass with `preclip_crop`: `|coords − crop_center| ≤ crop.size / 2`.
- When a pass's preclip is dispatched with `bboxForCrop=null` (coords-only), `computeFaceCrop` guarantees center = coords (clamped to fit). So the v122 retry is deterministic.

## Files
- `supabase/functions/compose-dialog-segments/index.ts`
- `supabase/functions/render-sync-segments-audio-mux/index.ts`
