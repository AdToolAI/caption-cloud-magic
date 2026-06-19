# Plan: v136 Preclip-Centered Coords

Status: ✅ shipped 2026-06-19

## Problem
Sync.so sync-3 returned the input preclip unchanged for every speaker pass on
scene af3901da (PSNR preclip→output 33–43 dB, no mouth motion). Root cause:
v131.4 forced `{ auto_detect: true }` on every preclip dispatch; sync-3's
internal ASD silently no-ops on heavily cropped, upscaled 720×720 face frames.

## Fix
- Dispatch explicit preclip-output-space coordinates centered on the preclip
  (`[outSize/2, outSize/2]`, `frame_number: 0`, `auto_detect: false`) for
  every preclip pass (single- and multi-speaker).
- Removed v131.4 (rule_0_preclip_coords_pro_forced_auto).
- Removed v131.5 final dispatch-path override; kept only the doc-strict
  sanitizer + assert for legacy auto_detect paths.
- Face-gate now runs on every preclip pass (no more `autoDetectPreclipNoHardGate`).

## Files
- `supabase/functions/compose-dialog-segments/index.ts`
- `mem/architecture/lipsync/v136-preclip-centered-coords.md` (new)
- `mem/index.md`

## Verify
Run "Sauber neu starten" on the failing scene. Expected on each pass:
```
_v102_probe.asd_mode = "v136_preclip_centered_coords"
pass.preclip_asd_source = "v136_preclip_center"
pass.preclip_asd_coords = [360, 360]   // for outputSize 720
```
PSNR(preclip → output) should drop ≤30 dB in the mouth region with visible
lip motion.
