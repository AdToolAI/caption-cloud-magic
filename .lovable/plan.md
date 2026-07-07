# v196 — Kill face morphs by hardening ALL overlay masks

## Corrected diagnosis
The morphs are visible **while the characters speak**, not only during silence. That rules out v195 as the primary cause. The real culprit is the **feathered radial masks** used by every face overlay in `DialogStitchVideo.tsx`:

- `FaceMaskShot` (v25 fan-out, voiced windows): `radial-gradient(#000 0%, #000 45%, rgba(0,0,0,0.75) 62%, rgba(0,0,0,0) 98%)` — a **~53% wide feather ring**.
- `FaceCropShot` (v66 preclip overlay): `radial-gradient(#000 0%, #000 45%, rgba(0,0,0,0.75) 62%, rgba(0,0,0,0) 98%)` — same 53% feather.
- `SilentFaceFreeze` (v195): `radial-gradient(#000 0%, #000 55%, rgba(0,0,0,0.85) 72%, rgba(0,0,0,0) 100%)` — ~45% feather.
- `PortraitAnchor` / other overlays: same pattern (ellipse feather 52%→100%).

In every feather band, the mask alpha is partial, so the compositor blends the Sync.so lipsynced face with the live master-plate face underneath. Sync.so output is reprojected/upscaled and never pixel-aligned with the source plate — the alpha blend of two slightly different mouth/head poses is exactly what shows up as a face morph. That's why all three characters morph *while* they speak.

## Fix (presentation-only, one file)
`src/remotion/templates/DialogStitchVideo.tsx`.

### 1. Replace every wide radial-feather mask with a hard clip
Shared helper `hardFaceMask(radiusRatio = 0.5)` returns:
`radial-gradient(circle at center, #000 0%, #000 ${(radiusRatio*100)-1}%, rgba(0,0,0,0) ${radiusRatio*100}%)`

That produces a solid disc with a ~1% anti-alias band — no two-pose blend zone.

Apply to:
- `FaceMaskShot` — full-frame Sync.so voiced overlay. Radius already scales from `bbox.size`; use `radiusRatio = 0.48` so the disc sits just inside the box edge.
- `FaceCropShot` — preclip crop overlay. Same 0.48.
- `SilentFaceFreeze` (v195) — 0.48.
- `PortraitAnchor` / ellipse variants — replace with the same disc; ellipse feather removed.

Falloff currently used to hide the rectangular tile edge against the plate. With a hard disc, the *only* pixels that ever mix with the live plate are the outer skin/hair pixels **outside** the disc — those come from the live plate alone (no blend) and have no lip motion to disagree about.

### 2. Keep bbox / positioning code untouched
- No changes to `preclip_crop`, `bbox`, cluster geometry, Sync.so ASD payloads, or v157/v160/v169 pipeline.
- No changes to `render-sync-segments-audio-mux` or any edge function.
- No new schema fields.

### 3. Version + logs
- Bump header comment: "v196 — hard face-disc masks (no feather blend)".
- One-time client console tag on first mount: `v196_hard_masks radius=0.48`.
- Memory update: append v196 note to `mem/architecture/lipsync/v195-silent-face-freeze.md` — records the mask hardening across FaceMaskShot / FaceCropShot / SilentFaceFreeze.

## Why this is the cleanest fix
- It's the smallest possible change: swap the mask CSS constant, nothing else.
- It removes the **only physical mechanism** that can turn two mouth poses into one morphing pose on screen.
- It preserves every invariant the pipeline already guarantees (identity anchors, per-speaker bbox, Sync.so contracts).
- It doesn't need a re-render of stored preclips or a data migration.

## Verification
1. Same 3-speaker scene from the screenshot: no seam on any speaker while speaking, no seam while silent.
2. Face edge in the final composite is a clean disc silhouette from the Sync.so output over the live plate; skin/hair outside the disc is live plate only.
3. `sortedShots` ordering and `<Sequence>` timings are byte-identical to v195; only pixel data at the mask edge differs.

## Files
- `src/remotion/templates/DialogStitchVideo.tsx`
- `mem/architecture/lipsync/v195-silent-face-freeze.md` (append v196 section)
