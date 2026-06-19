---
name: v136 Preclip-Centered Coords (Sync.so dispatch)
description: Sync.so sync-3 silently no-ops on auto_detect over face-cropped preclips; v136 dispatches explicit preclip-centered coordinates so every speaker actually gets lipsynced
type: feature
---

# v136 Preclip-Centered Coords

## Root cause (forensic, 2026-06-19, scene af3901da)

For 4 multi-speaker passes we measured PSNR between each Sync.so input preclip
and its output:

```
pass 1: 39.8 – 43.5 dB  → near identical
pass 4: 33.4 – 36.7 dB  → near identical
```

Sync.so sync-3 returned the preclip basically unchanged → no lip animation
for any speaker. Dispatch payload showed:

```
asd_mode = auto_detect
asd_has_coordinates = false
v1291.rule = "rule_0_preclip_coords_pro_forced_auto"
v1291.reason = "v131_4_dispatch_path_safety_override"
```

The v131.4 override was forcing `{ auto_detect: true }` on every preclip pass
on the assumption that the cropped frame has exactly one face so Sync.so could
locate it on its own. In practice sync-3's internal ASD has low confidence on a
heavily cropped, upscaled face and silently passthrough-renders.

## Fix

Dispatch explicit in-preclip-output coordinates:

```ts
active_speaker_detection: {
  auto_detect: false,
  frame_number: 0,
  coordinates: [[outputSize / 2, outputSize / 2]],
}
```

The preclip builder centers the crop on the speaker's face and pads/upscales
to `outputSize` (default 720). Geometric center = face center by construction,
so explicit center coords are safe for both single- and multi-speaker passes.

## Safety nets retained

- **v129.22.3 Sync.so auto-snap** (post-dispatch face-gate) still corrects
  sub-frame drift via `ok_after_snap` → re-strategy.
- **v135 pre-crop coord-snap** still runs on plate-space dispatches when no
  preclip exists.
- **Face-gate** now ALWAYS runs on preclip passes (the `auto_detect preclip
  trusted` skip is removed) — explicit coords make the gate a useful check.

## Removed

- `v131.4` `rule_0_preclip_coords_pro_forced_auto` (lines ~4094-4119)
- `v131.5` final dispatch-path override (lines ~5138-5204) — only the
  doc-strict mutex sanitizer + assert remain.
- Face-gate `autoDetectPreclipNoHardGate` short-circuit.

## Forensic markers after deploy

- `_v102_probe.asd_mode = "v136_preclip_centered_coords"`
- `_v105_probe.asd_has_coordinates = true`
- `pass.preclip_asd_source = "v136_preclip_center"`
- `pass.preclip_asd_coords = [360, 360]` (default outputSize=720)
- Expected: PSNR(preclip → output) drops to ≤30 dB in the mouth region;
  visible lip motion on all speakers.

## Files touched

- `supabase/functions/compose-dialog-segments/index.ts`
  - Lines ~4094: v131.4 block → v136 preclip-centered coords block
  - Lines ~4901: removed `autoDetectPreclipNoHardGate` skip
  - Lines ~5138: v131.5 final override → v136 doc-strict sanitizer only
