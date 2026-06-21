---
name: v165 Silent-Face Crop Fix
description: DialogStitchVideo SilentFaceFreeze now crops to the source-master slot region instead of cover-scaling the entire master plate into each slot (which produced ghost copies of every speaker in every slot)
type: feature
---

# v165 — Silent-Face Crop Fix

## Symptom (v164 bug)
4-Sprecher Dialog-Scene zeigte 8–12 überlappende "Geister"-Kopien der gesamten AI-Plate. Sah aus, als würde die gesamte Sequenz lipgesynct werden, obwohl Sync.so korrekt nur das aktive Speaker-Fenster pro Pass bekam.

## Root Cause
`src/remotion/templates/DialogStitchVideo.tsx` → `SilentFaceFreeze` rendered the full master plate via `<Video objectFit="cover" />` inside a `size × size` square. The "cover" mode zoomed the entire 1376×768 scene (with all 4 speakers visible) into each silent-slot square. With N=4 speakers and 3 silent slots per active window, the composer painted 3 fully-scaled copies of the whole scene at every active overlay → up to 12 ghost frames stacked.

## Fix
`SilentFaceFreeze` now uses a viewport-translate pattern (identical to how a CSS background-position crop works):

```
outer box (overflow: hidden, mask: soft circle)
   left = srcX * scaleX
   top  = srcY * scaleY
   w    = srcSize * scaleX
   h    = srcSize * scaleY
inner <Video> (Freeze frame={0})
   position: absolute
   left = -outer.left
   top  = -outer.top
   width  = compW   (full composition pixels)
   height = compH
   objectFit: fill
```

The inner `<Video>` matches the live master plate underneath exactly (same pixel grid), and the `overflow: hidden` on the outer box clips it to only the requested slot region. Result: every silent slot shows ONLY that one speaker's face frozen at frame 0, perfectly aligned with the live plate around it.

## Out of Scope (deferred)
Pass-Dispatches sind weiterhin sequentiell verkettet (sync-so-webhook → `advance:true` → nächster Pass). 4-Sprecher-Szenen brauchen daher noch ~10–12 min weil jeder Pass auf den vorigen Sync.so-Output wartet. Parallelisierung erfordert Umbau des per-Scene Dialog-Locks (`try_acquire_dialog_lock`) auf per-(scene, pass_idx) plus Entfernen der Webhook-Chain — separates Stage.

## Files
- `src/remotion/templates/DialogStitchVideo.tsx` (SilentFaceFreeze + Aufrufer)
- Migration: Reset von Scene `becaa5ce-e4c3-47b7-933d-766e83807b9c` für Re-Run
- Remotion-Bundle muss via `scripts/deploy-remotion-bundle.sh` neu deployed werden, bevor die nächste Lambda-Render-Pipeline den Fix nutzt.
