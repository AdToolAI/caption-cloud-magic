# Video Enhance — Parallel Jobs, Visibility, and End-to-End Acceptance

Finishes the two remaining parts of the approved architecture and then verifies the whole feature live. The proven transfer layer (6 MB chunks, stored offset, deterministic paths, leases, retry schedule, manual review) stays untouched, as does all pricing, wallet and refund logic.

## Current state (verified)

- `video-enhance` already exposes `open_runs` (all unfinished runs of the caller) next to `open_run`.
- The shared run store, the multi-run hook, the Enhance panel list and the header job center already exist in the frontend.
- History (`VideoGenerationHistory.tsx`) already reads `video_enhance_runs` for the signed-in user, including unfinished rows, and refreshes every 15 s.
- The five backend functions are deployed.
- `supabase/config.toml` has no entries for the new `video-enhance-persist` and `video-enhance-poll` functions, and there is no migration that schedules the new provider poller. These two gaps are the reason the new immediate-persistence path is not yet fully self-driving.

## Part 1 — Multiple parallel jobs (close the gaps)

1. Add config entries for the two internal functions so they are reachable without a user token (`verify_jwt = false`) and have a sufficient timeout (persist ~120 s, poll ~60 s). They stay internal-only through the existing shared-secret/service-role check in the handlers.
2. Topaz completion latency: the poller itself keeps a self-scheduling cadence of 15 s during the first 2 minutes, 30 s up to 5 minutes and 60 s afterwards, driven by the stored `next_provider_poll_at` and a self re-trigger while any run is due sooner than the next cron tick. The 1-minute cron stays only as a recovery trigger, and the reconcile every 5 minutes stays as watchdog. The browser never owns completion detection.
3. Re-check the claim path end to end so that queued jobs never fail: over-limit runs must stay claimable later, and the per-user limit of 1 heavy transfer must not block a second user.


## Part 2 — Visibility and restoration

4. Make History and the job center share one truth: History keeps its own query, but subscribes to the same run store so a state change (running → saving → done) updates the existing entry immediately, keyed by run ID, with no second row.
5. Confirm the job center and History both survive navigation, reload and re-login (store hydrates via `open_runs` on mount and on auth change).
6. Per-run cancel stays scoped: cancelling one run must not stop polling or change state for any other run.

## Part 3 — Automated tests

Added/extended tests:
- claim limits: 3 global / 1 per user, fair ordering, over-limit runs queue instead of failing;
- webhook + poller + cron racing one run → exactly one transfer, one completion;
- two runs of one user coexist; cancelling one leaves the other live;
- store hydration restores all unfinished runs; terminal runs stop polling;
- History mapping: one entry per run across running → saving → done, no duplicates;
- Topaz cadence: due-time schedule follows 15 s / 30 s / 60 s buckets and never lets two pollers work the same run;
- transfer layer untouched: resume from stored offset, no full-file buffering;
- no additional wallet debit or refund on any of these paths: exactly one reservation/debit per run, and retries, polling, webhook races and persistence cause no further financial mutation;
- monotonic run states: once a run is completed (or otherwise terminal), a late webhook, poll or reconcile response can never move it back to a non-terminal state — enforced in the database, not only in code.

### Security tests for the internal functions

`video-enhance-persist` and `video-enhance-poll` get a stricter caller gate than the reconciler: only the scheduler secret or the service role, never the public publishable key. Explicit tests prove that:
- an unauthenticated/public request to either function is rejected;
- a normal signed-in user's token cannot invoke either internal operation;
- one user can neither claim nor read another user's run (claim RPC and `status`/`open_runs` are user-scoped);
- only the internal secret / service-role path succeeds.


## Part 4 — Live acceptance, staged

Stage 1 (no provider money): 3 users × 2 jobs as a simulated concurrency scenario against database state and the claim RPC — verifies 3 global / 1 per user, fairness, queueing instead of failure, exactly one claim per run and no starvation.

Stage 2 (small real run): 1 user × 2 simultaneous real enhancement jobs, with the manual browser sequence — navigate away, check History shows both, reload, close the tab and sign in again, cancel one run and confirm the other continues. Reported per run: provider completion time, provider-completion → persistence-start delay, persistence duration, total duration, and exactly one charge, one persistence and no duplicate refund.

Stage 3 (full 3 users × 2 real 4K jobs) only after you approve the Stage 1 + 2 report; it needs three funded accounts and spends real provider money.

## Technical notes

- Files touched: `supabase/config.toml`, `video-enhance-poll` (self-scheduling cadence), one cron entry as recovery trigger, `src/components/ai-video/VideoGenerationHistory.tsx` (store subscription only), tests under `src/test/`.
- Not touched: `video-enhance-transfer.ts`, the transfer part of `video-enhance-finalize.ts`, pricing catalogs, wallet RPCs, refund keys, Lip-Sync and Director's Cut.

