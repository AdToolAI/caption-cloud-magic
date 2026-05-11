# Stage 8 — Comparable Thumbnails Backfill

Backfill the 49 Shot Director thumbnails so each axis uses ONE locked base scene and only the option's variable changes — fulfilling the existing comparable-thumbnail rule.

## Scope

For each of the 6 axes, generate one base scene, then edit it 6–10 times (once per option), keeping wardrobe / lighting / location / camera distance constant except for the axis variable.

| Axis      | Base scene (locked, English prompt)                                                                                                              | # edits |
|-----------|--------------------------------------------------------------------------------------------------------------------------------------------------|---------|
| framing   | Woman in beige trench coat on rainy neon-lit Tokyo street at night, shallow depth of field, cinematic                                            | 8       |
| angle     | Same woman, medium shot, eye-level, same wardrobe, same neon street                                                                              | 8       |
| movement  | Same woman walking down the same street, medium shot, neutral steady frame (motion implied via blur on tile + mv-* CSS loop)                     | 10      |
| lighting  | Same woman, medium close-up, neutral pose, plain interior backdrop (so lighting is the only variable)                                            | 10      |
| camera    | Same woman, medium shot, neutral daylight, same wardrobe, same backdrop                                                                          | 6       |
| lens      | Same woman, medium close-up, neutral daylight, same wardrobe, same backdrop                                                                      | 7       |

Total: **6 base generations + 49 edits = 55 image-gen tool calls.**

## Pipeline

1. **Generate 6 base scenes** with `imagegen.generate_image` (`premium.gemini`, 512×512), save to `src/assets/studio-presets/_bases/{axis}.jpg`.
2. **For each option**, call `imagegen.edit_image` on the matching base with:
   ```
   Same exact scene, same person, same wardrobe, same location, same lighting,
   same camera distance — change ONLY the {axisLabel}: {option.promptFragment}.
   Photoreal, cinematic, 512x512.
   ```
   Output overwrites `src/assets/studio-presets/{axis}/{id}.jpg` (paths already wired in `studioPresetThumbnails.ts`, no code changes needed).
3. **Spot-check** by viewing 2–3 axis grids in the preview; if a tile drifted (different person/scene), re-edit that single option.

## Execution strategy

- Run axis-by-axis (1 base + N edits) so a failed axis doesn't block others.
- Edits within an axis can be batched in parallel (3–4 at a time per turn, multiple turns).
- Realistically this needs **3–4 implementation loops** to finish without hitting tool-call limits per turn.

## Out of scope

- No code changes (thumbnail registry already maps every id → path).
- Cinematic Style Presets (12) stay as-is — distinct looks by design.
- No movement-axis CSS changes (already animates via Stage 7).

## Files touched

- **49 jpgs replaced** under `src/assets/studio-presets/{framing,angle,movement,lighting,camera,lens}/`
- **6 jpgs created** under `src/assets/studio-presets/_bases/`
- **Memory:** flip `comparable-thumbnail-rule.md` status from "rule defined, predates" → "rule defined and applied to all 49 Shot Director tiles"

## Estimate

Medium. No architectural risk. Pure regenerate-and-replace using existing patterns. The cost is tool-call count, not complexity.
