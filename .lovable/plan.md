# Stage 7 — Shot Director Visual Picker (Comparable + Animated)

The Shot Director already renders an image-tile picker (`PresetGrid` + 49 thumbs in `src/assets/studio-presets/{axis}/`). The gap vs. our two memory rules is real:

1. **Comparable thumbnail rule** — current thumbs use *different* hero scenes per option, so users compare scenes, not the axis itself.
2. **Animated tile rule** — Movement options are static jpgs; users can't *see* the camera move.

Stage 7 closes both gaps for the Shot Director picker. No new business logic.

## Scope

### A) Comparable base-scene regeneration (6 axes × N options = 49 tiles)

For each axis, lock ONE base scene; only the axis variable changes per tile.

| Axis      | Base scene (locked)                                                   | Variable           | # tiles |
|-----------|------------------------------------------------------------------------|--------------------|---------|
| framing   | woman in trench coat on rainy neon street, same wardrobe/lighting     | crop distance      | 8       |
| angle     | same woman, medium shot, same lighting                                 | camera angle       | 8       |
| movement  | same woman walking down street, same framing                           | camera movement    | 10      |
| lighting  | same woman, medium close, same pose                                    | lighting setup     | 10      |
| camera    | same woman, medium shot, neutral lighting                              | camera body / look | 6       |
| lens      | same woman, medium close, neutral lighting                             | lens character     | 7       |

Pipeline:
- Generate 6 base scenes via `imagegen.generate_image` (`premium.gemini`, 512×512), save under `src/assets/studio-presets/_bases/{axis}.jpg`.
- For each option, call `imagegen.edit_image` on its axis base with a strict English prompt: "Same scene, same wardrobe, same lighting — change ONLY {axisLabel}: {option.promptFragment}." Output overwrites the existing `src/assets/studio-presets/{axis}/{id}.jpg`.
- Cinematic style presets (12) keep their distinct looks (correctly *not* comparable — they're full looks, not single-axis variants).

### B) Animated Movement tiles

Reuse the existing `motionTiles.css` + `data-play` pattern from Stage 5 (Transitions/Scene-Anim).

- New component `MovementPreviewTile.tsx` (clone of `SceneAnimationPreviewTile`): renders the locked base image and applies a CSS-keyframe transform per `optionId` (push-in → scale 1.0 → 1.15; orbit-left → translateX + scale; crane-up → translateY; handheld → small jitter + rotate; dolly-left/right → translateX; static → no anim).
- Add 10 keyframe blocks to `motionTiles.css` (`@keyframes mv-push-in`, `mv-orbit-left`, …).
- `data-play` gates the loop (hover on grid tile + active selection), matching existing rule.
- Mount in `PresetGrid.tsx`: when `category === 'movement'`, swap the `<img>` for `<MovementPreviewTile imageSrc={thumb} optionId={opt.id} play={isHover || isActive} />`. Other axes stay as plain images (no behavioral change).
- Tooltip stays the existing `title={opt.description[lang]}`.

### C) Memory updates

- Update `mem://design/studio-presets/comparable-thumbnail-rule` to confirm Shot Director coverage (currently only mentions the rule, now lists the 6 axes as compliant).
- Update `mem://design/studio-presets/animated-tile-rule` to add `MovementPreviewTile` + `mv-*` keyframes alongside `TransitionPreviewTile` / `SceneAnimationPreviewTile`.
- Update `mem://features/ai-video-studio/shot-director-ui` to note "comparable base scenes + animated movement tiles".
- No `index.md` entry needed — both rule entries already exist.

## Out of scope

- No changes to `shotDirector.ts` config, `buildShotPromptSuffix`, or any prompt-injection logic.
- No changes to `SceneShotDirectorPanel` layout (it already uses `PresetGrid`, so it inherits B automatically).
- No new edge functions, no DB, no Composer wiring.
- Cinematic Style Presets thumbnails stay as-is (distinct looks by design).

## Files

- **New:** `src/components/studio-visual/MovementPreviewTile.tsx`
- **Edited:** `src/components/studio-visual/PresetGrid.tsx` (movement-aware branch), `src/components/studio-visual/motionTiles.css` (+10 `mv-*` keyframes)
- **Regenerated assets:** 49 jpgs under `src/assets/studio-presets/{framing,angle,movement,lighting,camera,lens}/` + 6 new `_bases/{axis}.jpg`
- **Memory:** 2 rule files + 1 feature file updated

## Estimate

Small-to-medium. Pure visual refinement using existing patterns from Stage 3 (variant generation) and Stage 5 (animated tiles). Image generation is the only slow step (~55 calls, parallelizable).
