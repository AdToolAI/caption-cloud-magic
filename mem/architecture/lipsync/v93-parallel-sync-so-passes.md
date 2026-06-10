---
name: v93 Parallel Sync.so Passes (Plan D, supersedes v60 serial-only)
description: Plan D Hebel D — flag-gated parallel dispatch of per-speaker Sync.so passes. With composer.parallel_sync_so_passes=true and composer.sync_so_concurrency_cap=N, compose-dialog-segments dispatches up to N passes in parallel against the SAME locked Hailuo plate; remaining passes stay `pending` and get chained by the webhook's pendingIdxs[0] kick. Race-safety: per-pass state writes go through atomic public.update_dialog_pass_slot() RPC; audio-mux dispatch wins via atomic public.try_claim_mux_dispatch() RPC so only one of N near-simultaneous COMPLETE webhooks fires the compositor. Pricing unchanged (Sync.so bills per output second × passes; parallel saves only wallclock). FROZEN I.9 rewritten — parallel is allowed under the race-safety contract.
type: architecture
---

# v93 — Parallel Sync.so Passes (Plan D, June 2026)

## Goal
4-speaker dialog scene wallclock: **10:30 min → ~5:40 min** (-46%).
Cost: **unchanged** (Sync.so prices per output-second × N_passes; parallel
only collapses the chain wallclock, not the billable seconds).

## Why it's safe now (and v60 wasn't a lie)

| Historical block | Then | Now |
|---|---|---|
| v33 double-dispatch race | no single-flight lock in compose-dialog-segments | `try_acquire_dialog_lock(90s)` since v33 |
| v60 FROZEN I.9 "no fan-out for any N" | 2-speaker fan-out showed same race symptoms as v33 N≥3 | precaution-generalization; lock now covers N≥2 |
| v56 `provider_unknown_error` | one Sync.so call with `segments[]` + lipsync-2-pro on locked plate | **different mechanism** — Plan D fires N independent single-pass calls, no segments[] |
| sync-3 default | lipsync-2-pro choked on static plates | v62: sync-3 is robust for locked plates regardless of N |

Plan D violates NONE of the active invariants I.1–I.12. It changes only
**when** pass-calls start, not **what** Sync.so receives.

## What changed

### 1. Migration (DB scaffold)
- `public.update_dialog_pass_slot(_scene_id uuid, _pass_idx int, _patch jsonb)`
  — atomic per-slot `jsonb_set` write. Prevents JSONB lost-update when
  N webhooks complete near-simultaneously.
- `public.try_claim_mux_dispatch(_scene_id uuid) returns boolean`
  — single conditional `UPDATE ... WHERE audio_mux.dispatched_at IS NULL`.
  First caller returns true, rest false. Race-safe single mux dispatch.
- `system_config` flags (both default OFF):
  - `composer.parallel_sync_so_passes` (boolean)
  - `composer.sync_so_concurrency_cap` (number, default 2, clamped [1..4])

### 2. `compose-dialog-segments/index.ts` (~L2915)
Replaced hardcoded `const fanOutAllowed = false` with a flag-gated branch:
```ts
parallelFlagOn = system_config['composer.parallel_sync_so_passes']
concurrencyCap = clamp(1..4, system_config['composer.sync_so_concurrency_cap'] ?? 2)
fanOutAllowed = parallelFlagOn && passes.length >= 2
if (fresh dispatch && fanOutAllowed) {
  // fan out passes [1 .. min(N, cap)-1] via background self-invokes
  // any beyond cap remain `pending` and get kicked by webhook pendingIdxs[0]
}
```
Telemetry: `plan_d_parallel_dispatch_start N_passes cap fanout_size`.

### 3. `sync-so-webhook/index.ts`
- `!allDone` branch (~L531): per-pass state write replaced with
  `supabase.rpc("update_dialog_pass_slot", { _scene_id, _pass_idx, _patch })`.
  Legacy full-array UPDATE remains as a fallback if the RPC throws.
- Multi-speaker mux dispatch (~L634): wrapped in
  `try_claim_mux_dispatch(scene_id)`. Skipped callers return
  `compositor: "already_dispatched"` with `plan_d_mux_lock_skipped` log.

## What stays UNCHANGED (safety anchors)
- Sync.so payload (sync-3 default, retry ladder v82/v84)
- Pricing formula `ceil(durationSec) × 9 × N_passes`
- v23 server-owned state + idempotent refunds
- v33 `try_acquire_dialog_lock` single-flight
- Locked-camera prompt (I.4), Manual-ASD guard (I.5), MAX_SPEAKERS=4 (I.6)
- audio-mux Lambda (`render-sync-segments-audio-mux`) — itself idempotent
  via `audio_mux.render_id`

## Rollout
Both flags ship OFF. Default behavior = v60 serial chain.

| Step | Cap | Test |
|---|---|---|
| 1 | OFF | confirm serial path unchanged |
| 2 | 2 | 2-speaker scene, watch for `plan_d_parallel_dispatch_start` + single `plan_d_mux_lock_acquired` |
| 3 | 3 | 3-speaker scene |
| 4 | 4 | 4-speaker scene, target wallclock < 6 min |
| 5 | 24h clean → consider promoting default | |

## Reversibility
```sql
UPDATE system_config SET value='false'::jsonb
WHERE key='composer.parallel_sync_so_passes';
```
Next scene reverts instantly to v60 serial. No deploy, no code rollback.

## Telemetry greps
- `plan_d_parallel_dispatch_start` — dispatcher fan-out
- `plan_d_mux_lock_acquired` — winning mux dispatch
- `plan_d_mux_lock_skipped` — losing webhooks (expected when N parallel)
- `plan_d rpc failed` — RPC fell back to legacy path (investigate)

## Files
- migration: `update_dialog_pass_slot`, `try_claim_mux_dispatch`, flags
- `supabase/functions/compose-dialog-segments/index.ts` (~L2915)
- `supabase/functions/sync-so-webhook/index.ts` (~L531, ~L634)
