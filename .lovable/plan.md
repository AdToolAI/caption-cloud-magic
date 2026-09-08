# Multiple parallel upscale jobs

## What I checked first

The one-job limit is **purely a frontend limitation**. There is no backend or database restriction:

- The database table for upscale jobs has no "one active job per user" constraint — the only unique keys are the job id, the duplicate-click key, the provider job id and the callback token.
- The server accepts a new job on every request; it only collapses genuine duplicate clicks (same request key) into one job.
- The client hook keeps exactly **one** job in memory (`run`), and on opening the panel it re-attaches to the *newest unfinished* job only. While that job is not finished, the Start button is disabled and the panel shows the running job — so picking another video looks blocked even though the server would happily accept it.

So the fix is a client-side change plus one small read-only addition on the server (return *all* unfinished jobs, not just the newest one). The processing, pricing, wallet and persistence logic stays untouched.

## What will change

1. **Server, read-only addition**: a new `open_runs` request that returns every unfinished job of the signed-in user (newest first, capped). The existing single-job request stays as-is for backwards compatibility. No pricing, wallet, provider or persistence code is touched.

2. **Client job state becomes a list**: the upscale hook keeps a map of jobs keyed by job id instead of one job, polls each unfinished job independently, and restores *all* unfinished jobs on load. Starting a job adds to the list; it never replaces or blocks another. Cancelling acts on one job id only.

3. **Panel no longer locks**:
   - Start button is disabled only while *this* order is being submitted or when the order itself is invalid — never because another job is running.
   - After a successful start, the video selection and settings reset so the user can immediately pick the next video.
   - The picker stays usable at all times.

4. **Job list in the panel**: all unfinished jobs are listed above the form, each with its own title/thumbnail, progress line and its own Cancel button. Finished jobs show the result with preview and download. This uses the existing progress component, once per job.

5. **Safety rail**: a small cap on simultaneously running jobs (default 3) so a user cannot accidentally fire off dozens of paid jobs. Above the cap the Start button explains that a slot frees up when a job finishes. If you prefer unlimited or a different number, say so and I'll adjust.

6. **Reload/close safety**: already guaranteed by the server owning the job — restoring *all* unfinished jobs on load makes that visible for every job, not just the newest.

## Technical notes

- `supabase/functions/video-enhance/index.ts`: add `open_runs` action, same query as `open_run` without `.limit(1).maybeSingle()`, returning the client projection array. Deploy this function.
- `src/hooks/useEnhanceVideo.ts`: `runs: Record<string, EnhanceRunRow>`, per-job poll timers in a ref map, `resumeOpenRuns()`, `startEnhance()` merges into the map, `cancelEnhance(runId)` unchanged in behaviour. Keep `run`/`isRunning` exports derived from the map so nothing else breaks.
- `src/components/ai-video/EnhanceVideoPanel.tsx`: render `activeRuns.map(...)` with `EnhanceRunProgress` + per-job cancel; Start disabled logic drops `isRunning`; reset selection after a successful start.
- `src/components/directors-cut/features/AIVideoUpscaling.tsx`: uses the same hook — keep it working on the derived single-job fields.
- Tests: extend `src/test/videoEnhance*` with cases for two concurrent jobs polled independently, cancel one leaves the other running, restore of multiple unfinished jobs after reload, and Start not disabled by another running job.
- Untouched: pricing, wallet/reservation, refunds, provider submission, chunked persistence/resume, reconcile.
