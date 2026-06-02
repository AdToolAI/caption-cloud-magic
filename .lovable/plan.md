# Bug

In 3-speaker dialog scenes, only the **first speaker's** lips move — speakers 2 and 3 stay closed-mouth, even though:

- All 3 turns produced Sync.so outputs (`output_url` set for shots 0, 1, 2)
- Each shot has **distinct, correct `target_coords`** (e.g. `[414,175]`, `[687,175]`, `[1075,261]`)
- Each shot uses the isolated per-speaker WAV trimmed to its window
- The stitch (`DialogStitchVideo`) overlays each Sync.so output at the right time window

# Root Cause

The current preclip path renders each turn's preclip as a **time-slice of the full master** (`DialogTurnClipVideo` keeps the full 1280×720 frame, all 3 faces visible). Sync.so then receives a wide multi-face frame plus `coordinates: [x,y]` and `auto_detect: false`.

Empirically (and documented in `syncso-stage-f-artlist-reliability`), **Sync.so's coords are advisory on multi-face frames** — it locks onto the most "speakerly" face (driven by audio energy of the loudest detected mouth region), which in our case is always **the leftmost / first-rendered face**. Since speaker 1's face is in every preclip, all 3 lipsynced outputs end up animating only speaker 1, and the stitch then overlays "speaker 1 moving lips" three times.

This matches the user's observation: speaker 1 mouths every line, speakers 2 & 3 never open their mouths.

# Fix: Face-Crop Preclips + Positioned Region Overlay

For 3+ speaker scenes (and as a more reliable default for 2-speaker scenes too) we must give Sync.so a **single-face frame** so coords cannot be misinterpreted, then composite the lipsynced face back at its original screen position during stitch.

## 1. New Remotion template `DialogTurnFaceCropVideo`

`src/remotion/templates/DialogTurnFaceCropVideo.tsx`

- Inputs: `masterVideoUrl`, `startSec`, `endSec`, source-master dims `(srcW, srcH)`, `cropCenter [x,y]`, `cropSize` (square, e.g. `min(srcH, srcW) * 0.5` ≈ 360-640px), `outputSize` (default 512).
- Renders a square preclip showing only the cropped face region, scaled to `outputSize × outputSize`, muted, MP4.
- Registered in `src/remotion/index.ts`.

## 2. Crop metadata helper

`supabase/functions/_shared/face-crop.ts` (new)

Given `target_coords`, face `bbox` (from `audio_plan.twoshot.faceMap.faces[slot].bbox` when present), and source dims:
- Compute a square crop that:
  - Is centered on `target_coords`
  - Has size = `max(bbox_diagonal × 2.0, srcH × 0.55)` clamped to fit inside source
  - Snapped to even pixels
- Return `{ x, y, size }` in source-master pixel space.

Fallback when no bbox is available: `size = floor(srcH * 0.6)` centered on coords, clamped to frame.

## 3. `render-dialog-turn` switches template per shot

- Detect 3+ speakers via `state.shots` distinct `speaker_idx`.
- For each shot in 3+ speaker scenes (and optionally 2-speaker), compute `crop` via the helper, persist on the shot as `preclip_crop = { x, y, size, outputSize }`, dispatch `DialogTurnFaceCropVideo` instead of `DialogTurnClipVideo`.
- Single-speaker scenes keep `DialogTurnClipVideo` (no behavior change).

## 4. `poll-dialog-shots` dispatch tweak

When `shot.preclip_crop` is set, the Sync.so preclip is single-face → switch to `mode = "auto"` (`active_speaker_detection.auto_detect = true`) and drop `coordinates`. With one face, auto-detect is now perfectly reliable and avoids any residual coord misinterpretation.

## 5. `DialogStitchVideo` overlay becomes a positioned region

`src/remotion/templates/DialogStitchVideo.tsx`

Per shot, if `crop` is present:
- Overlay `<Video src={outputUrl}>` absolutely-positioned at `{left: crop.x - crop.size/2, top: crop.y - crop.size/2, width: crop.size, height: crop.size}` (scaled to composition dims via `targetWidth/targetHeight` ratios).
- Apply a soft circular/feathered mask (radial-gradient `mask-image`) so the crop edges blend into the master plate underneath.
- Existing 6-frame crossfade stays.

When `crop` is absent (single-speaker scenes), keep current full-frame overlay behavior.

`render-dialog-stitch` passes `crop` for each shot into the composition props.

## 6. Schema additions (no migration needed — JSON columns)

- `dialog_shots.shots[].preclip_crop?: { x: number; y: number; size: number; outputSize: number }`
- Bump `dialog_shots.version` from 4 → 5 so any in-flight pre-fix shots get re-rendered with the new path.

## 7. UI feedback

- `useTwoShotAutoTrigger`: no change; existing retry/refund logic still applies.
- `SceneCard` "🎥 Clip + Lip-Sync neu rendern": no change — already triggers full reroll which will now go through the cropped path.

# Technical Section

| File | Change |
|---|---|
| `src/remotion/templates/DialogTurnFaceCropVideo.tsx` | NEW — square face-region preclip composition |
| `src/remotion/index.ts` | Register new composition |
| `supabase/functions/_shared/face-crop.ts` | NEW — helper computes square crop from coords + bbox + source dims |
| `supabase/functions/render-dialog-turn/index.ts` | Multi-speaker path → use FaceCrop template, persist `preclip_crop` on shot |
| `supabase/functions/poll-dialog-shots/index.ts` | When `preclip_crop` set: dispatch Sync.so with `auto_detect: true`, no coords; bump version 4→5 in shape guard |
| `supabase/functions/render-dialog-stitch/index.ts` | Pass per-shot `crop` into DialogStitchVideo props |
| `src/remotion/templates/DialogStitchVideo.tsx` | Schema gains `crop?`; ShotOverlay positions+sizes overlay to crop region with soft mask when crop is present |
| Memory `mem/features/video-composer/dialog-shot-pipeline` | Document v21 face-crop preclip rule |

## Crop sizing diagram

```text
source master frame (1280×720)
+----------------------------------------+
|        face1     face2        face3    |
|     (414,175) (687,175)    (1075,261)  |
|       ┌───┐    ┌───┐         ┌───┐     |
|       │   │    │   │         │   │     |
|       └───┘    └───┘         └───┘     |
+----------------------------------------+
        ↓ per-shot square crop (≈ 400×400)
+-------+   +-------+   +-------+
| face1 |   | face2 |   | face3 |
+-------+   +-------+   +-------+
        ↓ Sync.so (auto_detect, single face)
+-------+   +-------+   +-------+
| LS 1  |   | LS 2  |   | LS 3  |  ← each face actually animates
+-------+   +-------+   +-------+
        ↓ stitch overlays cropped lipsync back at original (x,y,size)
+----------------------------------------+
|      [LS1]    [LS2]         [LS3]      |  on top of muted master plate
+----------------------------------------+
```

## Why this fixes the bug

After the change, every Sync.so job sees exactly ONE face — there is no ambiguity for the active-speaker picker, so each turn's mouth motion lands on the correct speaker. The stitch composites each lipsynced face back at its original on-screen position, so the final video shows all 3 speakers moving their lips on their respective turns.

## Rollback safety

- Old single-speaker path is untouched.
- Existing scenes (version 4, no `preclip_crop`) still render with the legacy overlay — no retroactive breakage.
- A failed `DialogTurnFaceCropVideo` render reuses the existing preclip retry budget; final fallback path (`sync_source_kind='master'`) is unchanged for 1-2 speaker scenes.
