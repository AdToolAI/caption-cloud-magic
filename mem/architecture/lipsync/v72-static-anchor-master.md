---
name: v72 Static Anchor Master + Always-On Preclip Overlays
description: For multi-speaker (N≥2) dialog scenes, render-sync-segments-audio-mux now uses the static anchor image (lock_reference_url || reference_image_url) as the master plate instead of the i2v video — the i2v plate can drift / cut to a single person mid-scene, hiding speakers 3/4. Per-pass single-face preclips overlay always-on for the full totalSec (one shot per pass) so every speaker stays visible; lip-mouth animation only happens during their voiced turn. DialogStitchVideo schema gains optional masterImageUrl; when set it renders <Img> instead of <Video> as the underlying plate. 1-speaker tight-overlay path unchanged.
type: architecture
---

## Why

4-speaker scene (`12ea3e1b…`): lip-sync worked correctly but the final video only showed speakers 1 & 2 — the Hailuo i2v master plate started with all 4 in frame and then cut to a single person mid-scene. Our v68/v69 per-turn preclip overlays were windowed (`startSec/endSec = segment ± 0.08s`), so speakers 3 & 4 had nothing to render on top of after the plate switched.

## Change

1. `render-sync-segments-audio-mux/index.ts`:
   - Reads `scene.lock_reference_url || scene.reference_image_url`.
   - `useStaticMaster = isFanout && !!anchorImageUrl` (N≥2 only).
   - Adds `masterImageUrl` to inputProps when `useStaticMaster`.
   - `alwaysOn = useStaticMaster` → emits exactly one shot per pass spanning `[0, totalSec]` instead of per-segment windows.
   - Log tag now reports `fanout-N-speakers-static` vs `fanout-N-speakers` vs `single-tight-overlay`.

2. `src/remotion/templates/DialogStitchVideo.tsx`:
   - Schema: optional `masterImageUrl: string().url().optional().nullable()`.
   - Renders `<Img src={masterImageUrl}>` for full duration when set, else legacy `<Video src={masterVideoUrl} muted>`.

## Out of scope

- 1-speaker scene → unchanged (single-tight-overlay over video master, no drift problem).
- v68/v69 preclip render path, FaceMap, tight audio, refunds, sync-so-webhook → unchanged.
- Fan-out without anchor image → falls back to legacy video-master + per-segment windowed overlays.

## Lambda bundle dependency

The new `masterImageUrl` prop only takes effect after `scripts/deploy-remotion-bundle.sh` is run. Older bundles ignore the field and use `masterVideoUrl` (legacy behavior). The edge function payload is forward/backward compatible — no schema break.

## Verification

- Edge log: `mode=fanout-4-speakers-static master=<lock_reference_url>… shots=4` (one shot per speaker, not per segment).
- Rendered video: static 4-face anchor composition for full duration; each speaker's mouth animates only during their voiced turn; off-turn faces remain visible as closed-mouth stills.
