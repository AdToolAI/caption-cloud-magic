# Stage 7 — Shot Director Visual Picker — STATUS

## Shipped this turn (Part B + Memory)

- `src/components/studio-visual/MovementPreviewTile.tsx` (new) — locked-base + CSS-keyframe loop per movement option
- `src/components/studio-visual/motionTiles.css` — appended `mv-*` keyframes (push-in, pull-out, dolly L/R, crane U/D, orbit L/R, handheld, static)
- `src/components/studio-visual/PresetGrid.tsx` — movement-axis branch swaps `<img>` for `<MovementPreviewTile>`, hover-state added (`isHover || isActive` drives `data-play`)
- `mem://design/studio-presets/animated-tile-rule.md` — full rule with `mv-*` documented
- `mem://design/studio-presets/comparable-thumbnail-rule.md` — locked-base rule with all 6 Shot Director axes listed

The Shot Director picker (in `ShotDirectorPanel` and `SceneShotDirectorPanel`) now animates the camera move when the user hovers/selects a movement tile — push-in zooms, orbit rotates, handheld jitters, etc. Other axes unchanged.

## Pending (Part A — comparable base regeneration)

49 thumbnail regenerations (6 axes × N options) via `imagegen.edit_image` from a locked base scene per axis. Skipped this turn because 55 sequential image-gen tool calls would be too long for one loop. Spec lives in `comparable-thumbnail-rule.md`. Run as a dedicated follow-up turn or batch script.
