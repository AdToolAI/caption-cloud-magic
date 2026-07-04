---
name: v182 N=1 Tail-Hold
description: Single-speaker tight-overlay mux holds the final full frame after the last voiced window so raw Kling/Hailuo plate idle-mouth cannot continue after dialog end
type: feature
---

# v182 — N=1 Tail-Hold

## Problem

Single-speaker Kling Cinematic-Sync scenes could occasionally show the speaker still moving their lips after the dialog ended. The N=1 path uses tight audio + overlay mode: Sync.so output appears only during the voiced window, then the mux reveals the raw provider plate again. If Kling ignored the closed-mouth prompt and rendered subtle idle mouth movement, that raw plate movement became visible after the final turn.

## Fix

- `compose-video-clips/index.ts`: remove the N=1 prompt contradiction. `neutralTwoShotPrompt(n=1)` no longer asks for subtle continuous idle mouth/jaw motion; it now matches the v175 closed-mouth plate contract.
- `render-sync-segments-audio-mux/index.ts`: for `donePasses.length === 1 && anyTight`, compute the final `fanoutShots[].endSec` and pass `tailFreezeFromSec` to the stitch render when the final voiced window ends before `totalSec`.
- `DialogStitchVideo.tsx`: renders a full-frame `<Freeze>` from `tailFreezeFromSec` through scene end. This is a global hold of the master plate, not the old v164 per-face silent-slot freeze.

## Invariant

N=1 tight-overlay scenes must never fall back to a live raw provider plate after the final speech window. Hold the final post-dialog frame instead.
