## Problem

The global progress bar (`PipelineProgressBar` + `usePipelineProgress`) tracks elapsed time, baselines, and the monotonic floor in **component-instance refs** (`pipelineStartRef`, `runFloorRef`, `baselineRef`, `floorRef`, `startedAtRef`, `realProgressRef`).

These refs are lost whenever:
- the user navigates away from the Composer route (e.g. to another tab inside the app) and back,
- the device sleeps long enough that the route re-mounts on wake,
- React strict mode / a parent re-mount happens.

On remount, the "Lazy baseline initialization" detects in-flight scenes and seeds a **fresh baseline at `Date.now()`** with `elapsedSeconds = 0`. The render is still running in the background, but the bar starts again at ~1% and the elapsed/ETA counter starts at `0s / ~8:00 min`. That's the "Ladebalken fängt von vorne an"-effect the user sees.

## Fix

Persist the per-run progress state per project in `sessionStorage` and rehydrate on mount. The render itself is already backend-driven — only the *visual* progress state needs to survive a remount.

### Changes — `src/hooks/usePipelineProgress.ts` only

1. **New key derivation**
   - Read `projectId` (new optional arg to the hook) and build `key = composer:pipeline-progress:<projectId>`.
   - Fall back to `composer:pipeline-progress:default` when no project id yet (early-mount case).

2. **Hydrate on mount**
   - On first render, read the JSON payload from `sessionStorage`. If present, restore:
     - `pipelineStartRef.current` (epoch ms)
     - `runFloorRef.current` (0–100)
     - `floorRef.current` (per-phase floors)
     - `startedAtRef.current` (per-phase epoch ms)
     - `baselineRef.current` (clipsReady/Total, lipsyncDone/Total, dialogShots, voiceoverHadAudio, musicHad)
     - `realProgressRef.current` ({ value, at })
   - Bump `baselineVersion` once after hydration so dependent memos recompute with the restored snapshot.

3. **Persist on change (throttled)**
   - After the existing `runFloorRef.current = …` assignment near the end of the hook, write the snapshot to `sessionStorage` at most every 1s (timestamp guard, no extra effect needed).
   - Skip writes when `pipelineStartRef.current === null` (nothing running).

4. **Clear on terminal state**
   - When `allDone || completedCleanly || hasFailure` becomes true and the 5s settle-timer fires (the existing block that nulls `pipelineStartRef`), also `sessionStorage.removeItem(key)` so the next run starts clean.
   - Also clear when a fresh `clips:start` event arrives (already resets the refs — add the removeItem there too, before re-seeding).

5. **Wrap all `sessionStorage` calls in `try/catch`** (Safari private mode / quota).

### Changes — `src/components/video-composer/PipelineProgressBar.tsx`

- Accept and forward `projectId` to `usePipelineProgress({ … projectId })`.

### Changes — `src/components/video-composer/VideoComposerDashboard.tsx`

- Pass `projectId={project.id}` to `<PipelineProgressBar … />` (single new prop, no logic changes).

## Out of scope

- No backend / edge-function changes — the actual render keeps polling and finishing as it does today.
- No changes to the stall detection, phase weighting, or ETA math — only their *inputs* (the refs) get rehydrated.
- We intentionally use `sessionStorage` (not `localStorage`), so closing the tab still clears stale progress, but in-tab navigation and screen sleep no longer reset the bar.

## Verification

1. Start a Composer generation, switch to another route in the app, come back → bar resumes at the prior % and elapsed counter is correct (not 0s).
2. Start a generation, lock the screen for 1 min, unlock → same behaviour.
3. Close the tab and reopen the Composer URL → bar starts fresh (sessionStorage gone, as intended).
4. Let a run finish cleanly → after the 3s "100%" hold, the bar disappears and `sessionStorage` no longer holds the key (verified via DevTools).
