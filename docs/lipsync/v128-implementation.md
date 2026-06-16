# v128 Implementation Tracker — Alpha-Plan v3.1

**Invariant:** Ein terminaler Pass bleibt terminal. Jeder neue Dispatch nach Terminalzustand braucht eine neue `attempt_id` und eine explizite User-Aktion.

## Phase A — Surgical Recycle Closure (THIS RELEASE)

Status: ✅ Shipped

| # | Change | File | Status |
|---|---|---|---|
| A1 | NOOP-recovery loop (L486–540) removed → `PASS_DONE_SUSPECT` (status=done + `sync_noop_suspect: true`) | `sync-so-webhook/index.ts` | ✅ |
| A2 | FAILED retry ladder (`canRetry`) hard-disabled → terminal on first failure | `sync-so-webhook/index.ts` | ✅ |
| A3 | v87 coord-refresh: terminal passes preserved, new coords stored as `candidate_coords` | `compose-dialog-segments/index.ts` | ✅ |
| A4 | `meta.variant` alias added to NOOP-suspect log + `dispatch_source: "webhook"` | `sync-so-webhook/index.ts` | ✅ |

## Phase B — Architectural Hardening (NEXT)

Status: 🟡 Pending

| # | Change | File |
|---|---|---|
| B1 | Central `transitionPass()` helper in `_shared/dialog-transition.ts` with allowed-transition matrix; Sentry P1 on illegal `PASS_* → non-terminal` | new shared |
| B2 | Lint-rule blocking direct `dialog_passes[i].status = ...` writes outside helper | eslint config |
| B3 | `withDialogLock` wrapping in `sync-so-webhook` (currently imported but unused) | `sync-so-webhook/index.ts` |
| B4 | Watchdog reduction: no direct Sync.so POST; only timeout-mark + invoke D1 | `lipsync-watchdog/index.ts` |
| B5 | Stale-webhook = log-only event (no `dialog_passes` mutation) when `attempt_id` mismatch | `sync-so-webhook/index.ts` |
| B6 | `D6 Plan-D fan-out` feature flag `FEATURE_PLAN_D_FANOUT=false` + `triggerV5Advance` only for `pending && retry_count===0` | `sync-so-webhook/index.ts` |
| B7 | Circuit-breaker time-scope: `WHERE created_at > scene.last_reset_at` | `_shared/syncso-preflight.ts` |
| B8 | `attempt_id` first-class field on `dialog_passes[i]` + new-attempt-id on user-retry | DB + UI |
| B9 | UI yellow "degraded" badge for `sync_noop_suspect` + explicit "Retry pass" button | `SceneDialogStudio.tsx` |
| B10 | Migration: add `dialog_passes[i].attempt_id` defaults; backfill from existing rows | SQL migration |

## Phase C — Telemetry & A/B (LATER)

| # | Change |
|---|---|
| C1 | CI check: 100% new `syncso_dispatch_log.meta.variant != NULL` for `created_at >= v128_deployed_at` |
| C2 | Admin cockpit query for "0 (pass_idx, attempt_id) with > 1 provider_job_id" |
| C3 | Stage 3.5 Admin-Review for `sync_noop_suspect` → `PASS_FAILED_QUALITY_CONFIRMED` (manual) |
| C4 | Stage 4 A/B sync-3 vs lipsync-2-pro (~€9 / 30 renders) |

## Exit-Kriterien (48h Produktion after Phase A+B)

- 0 `(pass_idx, attempt_id)` with > 1 `provider_job_id`
- 0 `PASS_* → pending/retrying/dispatched` without user-retry flag
- 0 writes to `composer_scenes` outside `withDialogLock` in dispatch paths
- 0 coord-refresh resets on terminal passes
- 0 direct Sync.so POSTs from watchdog
- 0 `dialog_passes` mutations from stale webhooks
- 0 Sentry P1 `ILLEGAL_TERMINAL_TRANSITION_BLOCKED`
- 100% new dispatch-log rows have `meta.variant`, `meta.model`, `meta.attempt_id`, `meta.pass_idx`

## Verification (Phase A)

Run after deploy to confirm A1–A4 active:

```sql
-- A1: no more COMPLETED_NOOP_RETRY events
select count(*) from syncso_dispatch_log
  where sync_status = 'COMPLETED_NOOP_RETRY'
    and created_at > now() - interval '1 hour';
-- expect: 0

-- A1: PASS_DONE_SUSPECT events with meta.v128_terminal
select count(*) from syncso_dispatch_log
  where sync_status = 'COMPLETED_NOOP_SUSPECT'
    and meta->>'v128_terminal' = 'true'
    and created_at > now() - interval '1 hour';
-- expect: > 0 when NOOPs occur

-- A2: FAILED passes never come back to retrying after v128 deploy
select scene_id, count(distinct meta->>'pass_idx') as recycled_passes
  from syncso_dispatch_log
  where created_at > '<v128_deploy_ts>'
  group by scene_id
  having count(*) filter (where sync_status in ('FAILED','REJECTED','CANCELED')) > 0
     and count(*) filter (where sync_status in ('DISPATCHED','SUBMITTED') and created_at > min(created_at) filter (where sync_status='FAILED')) > 0;
-- expect: 0 rows
```
