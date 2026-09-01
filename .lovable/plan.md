# V531-OBS — Additive Observability for Lip-Sync Watchdog/Webhook RCA

Telemetry only. No business logic, no thresholds, no new tables/RPCs, no provider calls. Every write is fail-open through the existing `composer_record_callback_observation` path.

## (a) Files and functions to edit

1. `supabase/functions/_shared/v431-ledger.ts`
   - `recordObservationBestEffort()` (currently module-private, line ~832) — add a thin exported wrapper `recordDiagnosticObservation(admin, row)` that simply delegates to it. No signature or behavior change to the existing function or to `observeCallbackProvenance()`.

2. `supabase/functions/lipsync-watchdog/index.ts`
   - Add import of the new wrapper (file currently imports only `logMissingReinjectPointer` from `v431-ledger.ts`).
   - Inside the v511 poll-fallback loop, in the existing `if (!r.progressed)` branch (~line 651-666, right after the `apply_not_confirmed` console.warn): one awaited best-effort observation, verdict `apply_not_confirmed`, handler `lipsync-watchdog`, stage `sync_segment`.
   - Details: `ack_state` (`r.ack?.state ?? null`), `ack_unknown_cause` (`r.ack?.unknownCause ?? null`), `ack_reason` (`r.applyReason ?? null`), `provider_status` (`r.status ?? null`), `pass_idx` (`t.passIdx`), `age_ms` (`Number.isFinite(passAge) ? Math.round(passAge) : null`).
   - Identity columns: `externalJobId = t.jobId`, `pipelineJobId = t.pipelineJobId`, `sceneId = d.id`, `runId = d.active_run_id ?? ds?.run_id ?? null`, `plateGeneration = ds?.plate_generation ?? null`.

3. `supabase/functions/sync-so-webhook/index.ts`
   - Add the wrapper to the existing `v431-ledger.ts` import line (41).
   - Pre-lock block around line 1586-1592 (`planPreLockSpeakerMeasurement` → `runServerMotionMeasurement(snapPass, snapPassIdx, "pre_lock")`):
     - before the call: observation `motion_measure_start` — `phase: "pre_lock"`, `pass_idx: snapPassIdx`, `speaker_cardinality: snapSpeakerCardinality`, `plan_action: prePlan.action`.
     - wrap only that single call in `try { ... } catch (e) { <observe motion_measure_error>; throw e; }` — same error object rethrown, no conversion/retry/fallback.
     - after normal return only: observation `motion_measure_done` — `phase: "pre_lock"`, `pass_idx`, `measurement_status`, `attempts`, `v466_remeasured`, `verdict`.
   - `lock_phase_io_rounds_exhausted` return (~line 2415-2426): one observation `lock_phase_io_rounds_exhausted` with `rounds: __v5PhaseRun.rounds`, `last_request_kind: __v5PhaseRun.lastRequest?.kind ?? null`, `pass_idx` (best available snapshot index, else null), emitted before the unchanged `ok({...skipped: "lock_phase_io_rounds_exhausted"...})` response.
   - Identity columns for all three webhook observations: `pipelineJobId = v431CallbackJobId`, `sceneId`, `externalJobId = String(jobId)`, `runId = scene.active_run_id ?? null`, `plateGeneration = Number(scene.plate_generation) if finite else null`.

## (b) Discrepancies between current code and the requested design

- `recordObservationBestEffort` is **not exported** today; only `observeCallbackProvenance` is. Hence the minimal exported wrapper (explicitly allowed by the brief). No new RPC, no new table.
- `runServerMotionMeasurement` returns `void`. The fields required for `motion_measure_done` are partially block-local:
  - already hoisted and readable after return: `v404MotionMeasurement` (→ `measurement_status`), `v443MeasureAttempts` (→ `attempts`).
  - **not hoisted**: `v466ReMeasured` (declared at line 1222 inside the routine) and the resolved `v465Verdict` (line 1215). To read them after return, add two telemetry-only hoisted variables (e.g. `let obsV466Remeasured: boolean | null = null; let obsVerdict: string | null = null;`) assigned at the end of the routine next to the existing logging. They are written and read exclusively by telemetry; no branch may consume them.
- The watchdog scene query (line 326) does **not** select `plate_generation`. To stay strictly non-invasive, `plate_generation` is taken from the `dialog_shots` state when present, otherwise `null`. No column is added to the select.
- `lock_phase_io_rounds_exhausted` has no pass index in scope at the return site (the log line only carries `job=`). `pass_idx` will be the already-computed snapshot pass index if it is in scope there, otherwise `null` — no new lookup, no extra query.
- The watchdog branch has `applyReason`/`ack` available exactly as required; no shape change to `pollAndForward` is needed.

## (c) Minimal diff strategy

- One added export in `v431-ledger.ts` (delegating wrapper, ~10 lines). Existing functions untouched.
- Watchdog: one import edit + one inserted `await recordDiagnosticObservation(...)` block inside the existing branch. Zero changes to control flow, guards, `applyRejectedStuck`, inflight release, or terminalization.
- Webhook: one import edit, two telemetry-only hoisted variables plus their assignments, one `try/catch` that only rethrows, and three inserted observation calls. Zero changes to `planPreLockSpeakerMeasurement`, `measureWithBoundedReMeasure`, `measureProviderMotionSync`, V466 gray-band logic, fa4 lock orchestration, apply/settle paths, or any returned response body.
- Frozen values untouched: `WEBHOOK_FORWARD_TIMEOUT_MS`, `STALE_PROVIDER_MS`, measurement deadlines, retry counts/backoffs, v511 ack semantics, NOOP ladder, dispatch, V523/V524/V528/V529/V530, `compose-dialog-segments`.
- Details payloads carry only scalars/enums — no URLs, payloads, bytes, bodies, base64, or signed URLs.

## (d) Verification that no business behavior changed

1. Structural diff review: confirm the diff contains only import lines, the exported wrapper, telemetry variable declarations/assignments, observation calls, and a `try/catch` whose catch body is `observe(...); throw e;`.
2. Grep proof that no branch reads telemetry state: the new variables and the observation return values are never referenced in any `if`/`return`/ternary.
3. Constant freeze check: `git diff` shows no change to any threshold, timeout, retry count, or verdict mapping; the existing frozen-contract test suites (`lipsync-frozen-contract.test.ts` Deno + the vitest mirror) and the V529/V530 Deno suites run green.
4. Byte-level neighbour check: recompute RAW/LF SHA-256 for the frozen files (`v523`, `v524`, `v525`, `v526-A/B`, `v527 plateFaceSlotRouter`, `plate-face-track`, resolver, `compose-dialog-segments/index.ts`) and confirm they are unchanged.
5. Fail-open proof: temporarily simulate an RPC error in the wrapper path (local test) and confirm the watchdog branch verdict, the measurement result, the rethrown error identity, and the `lock_phase_io_rounds_exhausted` response body are all identical.
6. Typecheck: `deno check` on the three touched function files.
7. Post-deploy: deploy only `lipsync-watchdog` and `sync-so-webhook`; verify the five new verdicts appear in `composer_callback_observations` and that existing log lines/response shapes are unchanged.
