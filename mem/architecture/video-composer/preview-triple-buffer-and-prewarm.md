---
name: Composer Preview Triple Buffer & HTTP Prewarm
description: Eliminate the 2–3s freeze between scenes in ComposerSequencePreview by adding a hidden 3rd video slot (sceneIdx+2), HTTP range-prewarm of every clip, and a fast standby readyState path
type: feature
---

`src/components/video-composer/ComposerSequencePreview.tsx` previously stalled 2–3 s before scene 3 because the ping-pong buffer only preloaded `sceneIdx + 1` *after* the current crossfade finished. Short lip-sync clips left almost no time for the next standby to buffer, so `performTransition` waited up to `STANDBY_BUDGET_MS=1200` ms before crossfading.

Fix (no pipeline / no quality change):

1. **Triple buffer**: new hidden `videoCRef` (`<video preload="auto" muted aria-hidden …>`) always holds `sceneIdx + 2`. Mapped via `slotMapRef = { A, B, C }` and `setSrcForSlot('C', …)`. When the next ping-pong preload calls `el.src = url`, the bytes are already in the browser cache → instant load.
2. **HTTP prewarm**: on mount/reset, range-fetch the first `PREWARM_BYTES=524288` of every `playable[i].clipUrl` (max 2 parallel, `cache:'force-cache'`, abortable). Covers the moov atom + first frames.
3. **Faster standby decision**:
   - `readyState >= 3` (HAVE_FUTURE_DATA) → start crossfade immediately.
   - `readyState >= 2` (HAVE_CURRENT_DATA) → wait only `STANDBY_SOFT_WAIT_MS=200` ms instead of 1200 ms.
   - Otherwise wait `STANDBY_BUDGET_MS=1500` ms as hard fallback with a warn log.
4. Slot C is seeded in: initial reset, both video→video and image→video transitions, end-of-sequence reset, and scrub.

Pipeline, lip-sync, crossfade optics (400 ms), watchdog, audio/VO sync, mute logic — all unchanged.
