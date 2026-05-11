# Studio Presets — Comparable Thumbnail Regeneration (Premium/Nano Banana 2)

## Goal
Re-generate all 61 studio preset thumbnails (Lighting, Framing, Angles, Movement, Camera Bodies, Lenses, Cinematic Styles) so that **within one category, every variant shows the exact same base scene** — only the feature itself changes. The customer must instantly see *what the preset actually does*, not a different scene every time.

This becomes a **persistent rule** for all future preset/feature thumbnails across the editor (Shot Director, Cinematic Presets, future Pose Sheets, Wardrobe, Location Vibes, Filters, Color Grading, Transitions, Animations, etc.).

## Base Scene Locking — One Scene per Category

Each axis gets ONE locked base scene description. Every variant in that axis re-uses it verbatim, only the axis-specific modifier changes.

| Category | Locked Base Scene | What Varies |
|---|---|---|
| **Framing** (8) | Woman in beige trench coat standing on a rainy Tokyo street at night, neon signs behind her | Shot size only (extreme close → extreme wide) |
| **Angles** (8) | Same Tokyo street woman, identical pose & wardrobe | Camera angle only (eye-level, low, high, dutch, POV, OTS, bird's-eye, worm's-eye) |
| **Movement** (10) | Same Tokyo street woman walking forward | Camera movement implied via motion blur direction + framing hint (push-in, pull-out, dolly L/R, orbit L/R, crane up/down, handheld shake, static) |
| **Lighting** (10) | Portrait of the same woman, identical pose, plain background | Lighting setup only (golden hour, blue hour, soft studio, hard noir, neon cyberpunk, candlelight, moonlit, backlit, overcast, volumetric) |
| **Lenses** (7) | Same woman, medium shot, same Tokyo street | Lens character only (anamorphic flare/oval bokeh, vintage Helios swirl, Cooke creamy, Sigma clinical, Leica painterly, ARRI signature, Angenieux zoom compression) |
| **Camera Bodies** (6) | Same woman, same medium shot | Sensor/recording look only (ARRI Alexa 35 filmic, Sony Venice 2 clean digital, RED V-Raptor sharp, Panavision XL2 35mm grain, iPhone 17 Pro Max smartphone look, VHS camcorder lo-fi tape) |
| **Cinematic Styles** (12) | Same woman + same Tokyo street, but the *whole grade & atmosphere* shifts | Full style transformation (Noir, Cyberpunk, Arthouse, Action, Horror, Romantic, Sci-Fi Mystery, Documentary, Epic Fantasy, Symmetric Storybook, Thriller, Midnight Mood) |

Result: a customer flipping through 8 Framing cards sees the **same woman, same street**, only the crop changes — exactly like Artlist.

## Generation Approach

1. **Quality:** `imagegen--generate_image` with `model: "premium.gemini"` (Nano Banana 2) for all 61 thumbnails. 512×512, no transparent background.
2. **Prompt Template per Category:**
   ```
   {LOCKED_BASE_SCENE}. {AXIS_MODIFIER}. Photorealistic cinematic still, 
   square 1:1 framing, professional cinematography reference card.
   ```
   `LOCKED_BASE_SCENE` is identical across all variants in the axis. Only `AXIS_MODIFIER` changes.
3. **File paths stay identical** to current `src/assets/studio-presets/{category}/{id}.jpg` — no code changes needed in `studioPresetThumbnails.ts` or `PresetGrid.tsx`.
4. **Parallel batches** per category to keep generation time low.

## Persistent Rule (saved to memory)

A new memory entry will be saved so this convention applies to ALL future preset thumbnails the editor introduces:

> **Studio Preset Thumbnail Rule:** Within any preset axis (Framing/Angle/Movement/Lighting/Lens/Camera/Style/Filter/Grade/Transition/Animation/Pose/Wardrobe/Vibe), every variant thumbnail MUST re-use one locked base scene per axis. Only the axis-specific modifier changes. Customer must perceive the feature, not a new scene. Use `premium.gemini` (Nano Banana 2) at 512×512.

## Out of Scope (this round)

- No code/UI changes — only asset regeneration + memory rule.
- Pose Sheets, Wardrobe, Location Vibes, Filters and Color Grading thumbnails will follow the same rule when those stages are built (Stage 3+).

## Deliverables

- 61 regenerated `.jpg` files (same paths, overwriting current ones).
- 1 new memory entry under `mem://design/studio-presets/comparable-thumbnail-rule`.
- Index update.
