---
name: v199 Preclip-Primary Restoration (rollback v153.2)
description: compose-dialog-segments defaults to v169 per-speaker single-face preclip + frame_number+coords for all fresh dispatches. v153.2 unified full-plate bounding_boxes_url path is disabled by default and only reachable via FEATURE_V153_BBOX_PRIMARY=true env override for emergency rollback.
type: architecture
---

# v199 — Preclip-Primary Restoration (July 2026)

## Why
Two live production symptoms after v198 masks landed:

1. **Wrong-speaker lipsync** — user report: "Sprecher 3 sagt etwas, was
   nicht im Skript stand." Sync.so was receiving the full multi-face plate
   via v153.2 with `bounding_boxes_url`, and the bbox ordering did not
   always align 1:1 with `pass.speaker_idx` (v166 anchor bridge is
   best-effort). Result: the wrong mouth animated for that turn's audio.
2. **Residual face morphs on inactive speakers** — Sync.so's full-frame
   output on a multi-face plate re-projects cheeks/chin subtly even for
   speakers whose lips are NOT the pass target. DialogStitchVideo v198
   masks (55/56% radius) push the seam into hair/background, but a
   slightly-reprojected face UNDER the mask still reads as a morph.

Both symptoms trace back to the same root cause: v148/v153 disabled the
v169-canonical per-speaker preclip path (§7.3 of the internal rebuild
guide) in favor of a full-plate `bounding_boxes_url` shortcut. That
shortcut is the regression.

## Fix
Env flag `FEATURE_V153_BBOX_PRIMARY` (default `"false"`) now gates BOTH
v153.2 activation blocks in `compose-dialog-segments/index.ts`:

- `v153UnifiedBboxEligible` (~L4144) — the block that sets
  `pass._v153BboxPrimary = true` and nukes preclip fields is skipped.
- `v147BboxEligible` (~L4341) — the fresh-dispatch multi-speaker
  bbox-url-pro path is also skipped so `freshDefaultVariant` falls to
  `coords-pro`.

Downstream everything the v169 guide describes is still fully wired:
`pass-face-preclip.ts`, Rule 0 (v131.2 auto_detect_unconditional_on_preclip
→ actually coords-pro on preclip via ASD builder), v166 anchor-identity
bridge, v167 preclip pre-fanout, v168 per-pass lock, v169 stale-job
reconcile. Turning the v153 gates OFF simply lets the older code path run
again.

## Payload contract after v199 (matches v169-guide §5)
```json
{
  "model": "lipsync-2-pro",
  "input": [
    { "type": "video", "url": "<per-speaker-preclip>",  "segments_secs": [[s, e]] },
    { "type": "audio", "url": "<tight-per-turn-wav>" }
  ],
  "options": {
    "sync_mode": "cut_off",
    "active_speaker_detection": {
      "auto_detect": false,
      "frame_number": <preclip-frame>,
      "coordinates": [cx, cy]
    }
  }
}
```
No `bounding_boxes_url`. No `auto_detect: true` for N≥2. No
`temperature` / `occlusion_detection_enabled` on sync-3.

## Rollback
Emergency-only. Set env var `FEATURE_V153_BBOX_PRIMARY=true` on the
compose-dialog-segments function. Next scene reverts to v153.2 legacy
path. No code deploy required.

## Log markers
- `v199_preclip_coords_primary_active` — v199 gate fired on fresh
  dispatch, preclip path is primary.
- `v153.2_unified_bbox_primary` — only appears when
  `FEATURE_V153_BBOX_PRIMARY=true` (legacy rollback).

## Files
- edited `supabase/functions/compose-dialog-segments/index.ts` (2 gate
  additions, ~L4142 and ~L4339). No other files touched.
