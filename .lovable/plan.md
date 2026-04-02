

## Completed: Speed Ramping Overhaul

### Changes Made

1. **`src/utils/speedCurve.ts`** (NEW) — Shared utility with easing interpolation (`getSpeedAtTime`), weighted duration calculation (`calculateSceneDuration`), and easing functions (linear, ease-in, ease-out, ease-in-out).

2. **`src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`**
   - Removed double-speed bug: no longer multiplies `sceneRate × activeSpeed` — only uses keyframe-derived speed
   - Uses `getSpeedAtTime()` for smooth easing interpolation between keyframes
   - Source audio is ducked (volume reduced) when speed ≠ 1x instead of pitch-shifted — eliminates chipmunk effect
   - Voiceover and background music remain at constant 1x speed

3. **`src/components/directors-cut/features/SpeedRamping.tsx`**
   - Duration calculation uses weighted average via `calculateSceneDuration()` instead of simple arithmetic mean
   - More accurate scene duration feedback

4. **`src/components/directors-cut/ui/StepLayoutWrapper.tsx`**
   - Injects `liveCurrentTime` from the preview player into child components

5. **`src/components/directors-cut/steps/MotionEffectsStep.tsx`**
   - Uses `liveCurrentTime` from the embedded preview player for accurate keyframe placement
