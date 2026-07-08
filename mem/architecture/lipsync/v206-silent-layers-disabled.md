---
name: v206 Silent Overlay Layers Disabled (True v169 Parity)
description: Hard-disables SilentFaceFreeze (v195/v197), SilentFaceAnchor (v183/v190) and MouthMatteFreeze (v193) in the mux edge function. Only CroppedOverlay is composited over the master plate — non-speakers show the raw master plate. Restores true v169 behaviour after v205 alpha-feather rollback revealed morph artefacts caused by static freeze tiles drifting against the animating master plate.
type: architecture
---

# v206 — Silent Overlay Layers Disabled

## Why

v205 restored v169's wide alpha-feather mask (`#000 0%→30%, transparent 78%`) but kept every post-v169 overlay layer active. With the wide feather, static per-speaker freeze tiles (`SilentFaceFreeze` v197, `SilentFaceAnchor` v183, `MouthMatteFreeze` v193) blend heavily with the underlying animating master plate. Per-frame divergence between the frozen face and the moving plate produced visible morph/wobble on speakers — and the freeze layer partially masked the active speaker's mouth before the Sync.so overlay drew on top, which registered as perceived lip-sync delay.

v169 never had any of these silent layers. Non-speakers simply showed the raw master plate.

## Fix

`supabase/functions/render-sync-segments-audio-mux/index.ts`:

- `const SILENT_LAYERS_DISABLED = true` at file top.
- After reading the `composer.silent_anchor_v195`, `composer.silent_faces_v183`, and `composer.listener_mouth_matte` flags, override all three to `false` when `SILENT_LAYERS_DISABLED`. Flags remain in `system_config` for later re-enablement without a code deploy but currently have no effect.
- Result: `silentFaceFreezes = []`, `silentSlotBySpeakerIdx` empty, `mouthMatteBySpeakerIdx` empty. `silentFaceAnchors` and `mouthMattes` are not emitted into inputProps.
- Telemetry: mux log adds `silent_layers_disabled=true`.
- v205 `faceMask` guard remains (`v205_facemask_fallback_on_multispeaker`).

`src/remotion/templates/DialogStitchVideo.tsx`:

- No component removal. The existing render code only mounts `SilentFaceFreeze` / `SilentFaceAnchor` / `MouthMatteFreeze` when the corresponding array is non-empty, and those arrays are now always empty.
- Composition-mount `console.log`: `overlay_mask_version=v169_parity silent_layers_expected=empty silent_freezes_received=<n>` for post-deploy verification.

## Not changed

Sync.so dispatch (v204 preclip + clip-space bbox), preclip render, anchor/cast/id resolution (v195/v201), refund/watchdog, all `CroppedOverlay` mask profiles from v205 (stay v169-wide). No Poisson blending, no landmark segmentation.

## Deploy

1. Edge function auto-deploys on save.
2. Redeploy Remotion bundle via `scripts/deploy-remotion-bundle.sh` (for the diagnostic console.log; behaviour change is server-side).

## Verification

Mux log line:
- `overlay_mask_version=v169_parity`
- `silent_slots_used=0`
- `facemasks_used=0`
- `silent_layers_disabled=true`
- `crops_used>=N-1`

Remotion Lambda log:
- `[DialogStitch] overlay_mask_version=v169_parity silent_layers_expected=empty silent_freezes_received=0`

Visual: no halo, no face morph/wobble, lip-sync timing matches Sync.so output frame-for-frame.

## Known trade-off (v169 behaviour, accepted)

On plates with pronounced idle mouth motion, non-active speakers may show subtle background lip movement ("ghost-mouthing"). This is exactly how v169 behaved and was acceptable to ship. The professional replacement (mouth-region reprojection with Poisson/gradient-domain blending) is deferred until paying-customer feedback identifies it as the next bottleneck.
