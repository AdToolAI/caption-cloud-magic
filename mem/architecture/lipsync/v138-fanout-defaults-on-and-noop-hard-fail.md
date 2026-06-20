---
name: v138 — Plan-D Fan-out defaults ON + NOOP hard-fail confirmed
description: Flips parallel sync.so fan-out defaults from false to true in compose-dialog-segments code; DB/env flags become kill-switches only. Confirms v134 NOOP ladder already hard-fails on canEscalate=false.
type: feature
---

## Why

Scenes with 3-4 speakers took 17-23 min instead of the expected 6-10 min.
Forensics on scene `70555e30…` showed `PLAN_D_FANOUT_BLOCKED_V128` in the
dispatch log **despite** ops setting `composer.parallel_sync_so_passes=true`
and `composer.plan_d_fanout_force_enable=true` in system_config. Root cause:
the deployed edge function still read the **env** killswitch
`FEATURE_PLAN_D_FANOUT` which defaulted to `"false"`, so the OR-gate
(`planDFanoutEnvOn || fanoutForceEnableDb`) evaluated to `false` whenever
the env var was missing or stale.

In addition, `parallelFlagOn` and `fanoutForceEnableDb` themselves
defaulted to `false` in code, so any transient DB read failure or
missing row also fell back to serial mode.

## Change

In `supabase/functions/compose-dialog-segments/index.ts` (~line 5613):

- `parallelFlagOn` defaults to `true`. DB row only flips it to `false`
  when explicitly set to `false` / `"false"`.
- `fanoutForceEnableDb` defaults to `true`. Same explicit-false semantics.
- `planDFanoutEnvOn` defaults to `"true"` (env-var default flipped).

Net effect: fan-out is ON by default for any scene with `passes.length >= 2`,
unless an operator explicitly disables it (DB row = false OR
`FEATURE_PLAN_D_FANOUT=false` env).

`concurrencyCap` unchanged (default 2, max 4).

## NOOP-never-done confirmation

`sync-so-webhook/index.ts` line 626: `if (noopSuspect && !canEscalate)`
already hard-fails the pass (status=failed, refund, scene
`twoshot_stage=needs_clip_rerender`, user-visible `clip_error` in German).
Line 715: `if (canEscalate && nextRung)` re-dispatches via the v134 ladder
(`bbox-url-pro` → `coords-pro-box`). The previous bug where Samuel + Matthew
were marked `done` with frozen lips was a **deploy-lag artifact** of the
older PASS_DONE_SUSPECT path, not a missing code path. v138 forces redeploy
of compose-dialog-segments by editing the file; webhook will follow.

## Expected impact

- 4-speaker scenes: ~6-10 min instead of 17-23 min
- Frozen-lips outcome impossible: pass either succeeds with real lip
  movement or hard-fails with refund + clear user message
- No DB migration needed; existing DB flags continue to work as
  intentional kill-switches

## What was NOT done

- The full ~5,700 → ~2,500 line consolidation of compose-dialog-segments
  is deferred. That is invasive and the symptom-fixes above resolve the
  reported run-times and the frozen-lips bug. Consolidation lives as a
  separate follow-up.
- No provider swap, no new ASD strategy, no new gate layer.
