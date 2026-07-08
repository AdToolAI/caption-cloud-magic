---
name: v205 Mux/Overlay v169 Parity
description: Rollback of hard-disc masks (v196–v198) to v169's wide symmetric alpha-feather so multi-speaker dialog stitches show no visible speaker outlines. Sync.so dispatch (v204 preclip + clip-space bbox) unchanged.
type: architecture
---

# v205 — Mux/Overlay v169 Parity

## Problem

v196–v198 hard-disc masks (`#000 62%, transparent 63%`) put the seam on
skin, where the 1–3% H.264 quantization drift between the Sync.so output
and the live master plate produced a visible oval outline around each
speaker. v169 never showed this because it used identical wide radial
feathers on every overlay layer.

## Fix (Remotion template)

`src/remotion/templates/DialogStitchVideo.tsx` mask stops for every
overlay component: `radial-gradient(circle at center, #000 0%, #000 30%,
rgba(0,0,0,0) 78%)`.

Applies to:
- `CroppedOverlay` (active preclip overlay)
- `SilentFaceAnchor` (v183 portrait tile)
- `SilentFaceFreeze` (v197 per-speaker plate freeze)
- `MouthMatteFreeze` (v193 mouth-matte, ellipse variant)
- `FaceMaskOverlay` (px-space gradient: core=radius×0.6, outer=radius×2.2)

All layers share the same feather profile so speaker switching has no
edge flicker.

## Fix (edge function)

`supabase/functions/render-sync-segments-audio-mux/index.ts`:
- `OVERLAY_MASK_VERSION = "v169_parity"` telemetry constant.
- Logs `overlay_mask_version`, `crops_used`, `facemasks_used`,
  `silent_slots_used`, `color_match_enabled` per mux.
- Hard guard: if `isFanout && donePasses.length >= 2` and any shot
  falls back to `faceMask` (missing `preclip_crop`), the function
  refuses to dispatch (`v205_facemask_fallback_on_multispeaker`).
  This keeps the canonical N≥2 path preclip-only.

## Explicitly not changed

Sync.so dispatch (v204 preclip + clip-space bbox), preclip render,
anchor/cast resolution (v201), silent-faces principle, refund/watchdog
paths. No color-match, no Poisson blending, no landmark segmentation —
those are deferred until customer feedback identifies the next
bottleneck.

## Deploy checklist

1. Deploy `render-sync-segments-audio-mux` edge function.
2. Redeploy the Remotion bundle via `scripts/deploy-remotion-bundle.sh`
   — template mask changes only take effect after this.
3. Re-mux a known N≥2 scene; verify mux log shows
   `overlay_mask_version=v169_parity`, `facemasks_used=0`, and the final
   MP4 has no visible speaker outlines.
