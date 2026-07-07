---
name: v195 Silent-Face Freeze (Geometry-Matched)
description: Per-speaker <Freeze frame=0><Video src=masterPlate/></Freeze> tiles at preclip_crop bbox in DialogStitchVideo mask pre/post-script lip motion on the raw AI plate while background body/environment keep animating from the live plate underneath. Supersedes v182 tail-freeze and v183/v190 portrait ghost overlays.
type: architecture
---

# v195 — Silent-Face Freeze

## Problem history
- **v182** N=1 tail-hold froze the **entire** master frame after the last voiced window → also froze body, background, hands. Widerspricht dem Ziel "Bewegungen im Hintergrund zu jeder Zeit möglich".
- **v183 / v190** rendered `brand_characters.portrait_url` as a static tile at each silent speaker's `preclip_crop` bbox. Portrait geometry rarely matched the plate → visible identity mismatch, ghost, morph artefacts. **v192 disabled** globally.
- Between v192 and v195 there was **nothing** masking pre/post-script mouth motion for N≥2, and only the full-frame v182 hack for N=1.

## Fix
For every done pass with a valid `preclip_crop`, the mux emits a `silentFaceFreezes[]` slot into the Remotion payload. Each slot is a bbox in source-master pixel space. `DialogStitchVideo` renders one `<Freeze frame={0}><Video src={masterVideoUrl} muted /></Freeze>` per slot, positioned/cropped to the bbox, spanning the entire scene. Active Sync.so shot overlays for that speaker draw ON TOP during voiced windows → the frozen tile is only visible during silence (head + gaps + tail).

Because the tile is a crop of the **same** master plate at frame 0:
- Identity, pose, lighting, colour, edge all match perfectly — no ghost.
- No portrait registration/scale math — no morph.
- Body, hands, hair, environment **outside** each face bbox continue to render from the live master plate underneath → background motion invariant preserved.

## Files
- `supabase/functions/render-sync-segments-audio-mux/index.ts`
  - Builds `silentFaceFreezes: [{x,y,size,speakerIdx}]` from `donePasses[].preclip_crop`.
  - Suppresses `tailFreezeFromSec` when v195 emitted ≥1 slot; tail-freeze only survives as an emergency fallback when v195 has no slots.
  - Legacy v183 portrait path gated OFF when v195 is ON.
- `src/remotion/templates/DialogStitchVideo.tsx`
  - New `silentFaceFreezes` payload field (zod-validated).
  - New `SilentFaceFreeze` component (freeze frame 0 of master video, bbox-clipped, feathered radial mask).
  - Rendered above master plate, BELOW all `sortedShots` overlays.

## Feature flag
`system_config.composer.silent_anchor_v195` — default **TRUE**. Set to `false` to fall back to v182 + no silent tiles.

## Log tags to grep
- `v195_silent_anchor slots=N/M enabled=… isFanout=…` — number of freeze tiles emitted per scene.
- `v182_n1_tail_hold_fallback …` — only fires when v195 emitted 0 slots (edge case, no preclip_crop).

## Invariants (FROZEN)
- v195 tiles use **only** the master plate; never a portrait.
- v195 tiles use **only** `preclip_crop` (already validated by Sync.so pipeline).
- v195 slots are emitted for **every** done pass regardless of N.
- Full-frame `tailFreezeFromSec` is emitted only when v195 emitted zero slots.

---

## v196 addendum — hard face-disc masks (July 7 2026)

Symptom after v195 shipped: all speakers showed a visible face morph **while speaking**, not only during silence. Root cause was orthogonal to v195:

Every face overlay in `DialogStitchVideo.tsx` (`FaceCropShot`, `FaceMaskOverlay`, `SilentFaceAnchor`, `MouthMatteFreeze`, `SilentFaceFreeze`) used a wide feathered radial mask (roughly `#000 45% → transparent 98%`). Inside that feather ring the compositor alpha-blends the Sync.so lipsynced face with the live master-plate face underneath. Sync.so output is reprojected/upscaled and never pixel-aligned with the source plate — the blend of two slightly different mouth/head poses is exactly what read on screen as "morph".

Fix: hardened every overlay mask to a solid disc/ellipse with only a 1% anti-alias band (e.g. `#000 0% → #000 47% → transparent 48%`). Pixels are either fully Sync.so or fully live plate — no cross-fade zone can exist. Geometry, positioning, ordering, timing, and the entire compose/dispatch pipeline are unchanged.

Grep tag: `v196` in `DialogStitchVideo.tsx`.
