---
name: v101 Preclip Explicit Crop-Local Bbox Restored
description: compose-dialog-segments sends explicit per-frame crop-local bounding_boxes for preclip dispatches (sync-3) to prevent silent no-op (closed-mouth) outputs; v100 auto_detect for preclips was a regression vs v99
type: architecture
---

# Why

DB-verified silent no-op on scene `07185a89-6540-4d49-ab91-69e4e554d182`
(4 speakers): all 4 Sync.so jobs returned `status=done`, but every face
kept the mouth fully closed. v100 had downgraded preclip dispatch to
`active_speaker_detection: { auto_detect: true }` to stop a different
`provider_unknown_error` regression on scene 720fd0b1, but the real cause
of that 720fd0b1 outage was `temperature: 1.0` combined with bbox — not
the bbox itself. v99 already documented that preclips need explicit
crop-local bboxes or sync-3 will silently no-op the mouth.

# Rule

For `usePassPreclip` dispatches:

1. Compute speaker plate-pixel bbox: prefer `speakerPlateBboxes[idx]`,
   else anchor-rescale `faceMap.faces[].bbox`.
2. Translate into crop-local 512×512 coords via
   `(plateBbox - preclip_crop.{x,y}) * (outputSize / size)` with ±12 %
   padding on the larger dim, clamped to `[0, outputSize]`.
3. Send `active_speaker_detection: { auto_detect: false, bounding_boxes }`
   with one (static) box per output frame
   (`ceil((tightAudioInfo.durSec ?? totalSec) * 30)`).
4. Keep `temperature: 0.5` (the v100 safe default). Do NOT raise to 1.0.

If `preclip_crop` or plate bbox is missing, graceful-degrade to
`auto_detect: true` and log `v101_preclip_bbox_skip` — same fallback the
v99 path used.

# Files

- `supabase/functions/compose-dialog-segments/index.ts` — preclip branch
  of the `syncOptions` builder (~line 2536).

# Verification

Edge log line `v101_preclip_bbox speaker=… cropLocalBox=[…] frames=… preCrop=… plateBbox=…`
on every preclip pass. Mouth movement on output > visible (no closed-mouth
freeze across all 4 passes).
