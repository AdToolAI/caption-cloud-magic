# TICKET: Composer refund key `gen:<scene_id>:failure` is too coarse

**Status:** resolved 2026-09-08 · **Priority:** high (financial integrity) · **Opened:** 2026-09-08

## Resolution (2026-09-08)
- New RPC `composer_refund_scene_run(user, scene, run, amount, reason)`: key = `gen:<scene_id>:<run_id>:<reason>`;
  legacy calls without run id fall back to the historical `gen:<scene_id>:<reason>` key (at-most-once, never over-refunds).
- Refund amount is bounded by the matching charge (run-scoped `metadata.run_id`/`run_ids`/`generation_id`, then scene-scoped)
  minus refunds already recorded against that charge (`bounded_charge_id` / `refund_charge_id`).
- `compose-clip-webhook` failure path now calls the new RPC with the callback's `run_id`; watchdog/recovery already used
  `composer_refund_charge` (charge-level) and are unchanged.
- Tests: `supabase/tests/composer-refund-key-granularity.test.sql` (same run retried → 1; second charged run → 2nd refund;
  concurrent loser → no-op; legacy row → fallback key, no over-refund; cap at charge) — all green, rolled back.
- Historical ledger rows untouched. No pricing / charge / Lip-Sync changes.

## Problem
`refund_ai_video_credits(p_refund_key)` defaults to `gen:<generation_id>:failure`. In Composer paths the
`generation_id` passed to the wallet is the **scene id** (and for `compose-video-clips` charges, the
**project id**), not the individual charge. A scene can be charged again on every new attempt
(re-render, re-lipsync, retry), so:

- attempt #1 fails → refund with key `gen:<scene>:failure` succeeds
- attempt #2 (new charge) fails → refund with the **same key** is rejected by
  `ai_video_transactions_refund_key_uniq` → **customer is not refunded** for a legitimate second failure.

The inverse risk (double refund) is already blocked by the unique index; the remaining risk is
**under-refunding** after the idempotency hardening.

## Evidence
Project `ed82075f-f888-4b17-ba00-ecf506eb6363` (account 8948d3d9): 42 separate 4.50 charges share one
`generation_id`; 33 carry `metadata.run_id`, 9 legacy charges carry none. The 22 lip-sync refunds already use
per-run keys (`lipsync_refund:<run_id>:<attempt>`), which is the correct granularity.

## Required change
1. The idempotency key must identify the **specific financial charge**, not the scene:
   `gen:<charge_transaction_id>:failure` or `gen:<scene_id>:<run_id>:failure` (run = `composer_scene_runs.id`
   / pipeline attempt id).
2. Every Composer debit must persist `metadata.run_id` (and ideally the debit `transaction_id` on the run row)
   so the refund path can derive the key deterministically without guessing.
3. Refund amount must be bounded by the *matching charge*, not by "any charge on this scene".
4. Add a test: two sequential failed attempts on one scene → two refunds, each once; a retried refund of
   attempt #1 → no-op.

## Scope guard
No change to sale prices, provider routing, Lip-Sync pipeline behavior, or the already-applied
duplicate-refund corrections.
