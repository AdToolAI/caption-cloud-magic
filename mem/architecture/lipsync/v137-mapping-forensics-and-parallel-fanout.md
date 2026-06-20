---
name: v137 Mapping Forensics + Parallel Fan-out Enable
description: Per-pass speaker→face mapping forensics persisted on dialog_shots passes; DB-only override to unlock Plan-D parallel Sync.so dispatch for multi-speaker scenes.
type: feature
---

# v137 — Mapping forensics + parallel fan-out enable

## Problem

Scene `731a4a05` (Jun 20 2026):
- 4 speakers, 23 minutes wall-clock.
- Only speakers 3 + 4 had visible lip-sync; speakers 1 + 2 silent.
- Persisted coords: Samuel `[618,313]`, Matthew `[550,154]`, Kailee `[798,169]`, Sarah `[1032,161]` — first two look mismapped (y too low / x ordering off).

Two separate issues:
1. **Speed**: 4 passes run effectively serial. Plan-D fan-out was gated behind both `composer.parallel_sync_so_passes` (DB) AND `FEATURE_PLAN_D_FANOUT` (env). Env flag is off in prod ⇒ always serial.
2. **Mapping confidence**: heavy v131–v136 logic exists but the per-pass forensic trail lives only in `syncso_dispatch_log.meta`. Cockpit / dialog_shots passes don't expose what the resolver decided, so visually diagnosing which pass got the wrong face requires a log join.

## Change

### 1. DB-only override for Plan-D fan-out

`compose-dialog-segments/index.ts` adds a third gate: `composer.plan_d_fanout_force_enable`. When `true`, fan-out is allowed even when `FEATURE_PLAN_D_FANOUT` env is `false`. Other constraints (`parallelFlagOn`, `passes.length >= 2`, concurrency cap) are unchanged.

Migration sets:
- `composer.plan_d_fanout_force_enable = true`
- `composer.sync_so_concurrency_cap = 2` (conservative; max 4 in code)

Expected effect on a 4-speaker scene: passes 0 and 1 dispatch in parallel; webhook chains 2 and 3 as the first pair completes. Wall clock should drop from ~23 min to roughly half.

### 2. Per-pass mapping forensics on dialog_shots

Each pass now carries `v137_mapping`:
- `coord_source` — `plate-identity` | `plate-slot-fallback` | `identity` | `slot` | `heuristic` | `none`
- `plate_bbox` — bbox the resolver picked for this speaker on the plate
- `plate_face_count` — total faces the plate detector saw
- `plate_identity_resolved` / `plate_identity_method` / `plate_identity_min_conf` / `plate_identity_min_margin`
- `plate_dims`

These mirror what already lives in `syncso_dispatch_log.meta` but are written before dispatch and persist on the dialog_shots row, so the cockpit can render a per-pass mapping badge without a log lookup.

## What this does NOT do

- No change to `pickSpeakerCoordinates` / `resolvePlateFaceIdentities` / `pass-face-preclip` selection logic. The v131–v136 stack is preserved.
- No additional preclip retry. The existing v116 face-gate is unchanged.

The plan was to also harden y-band filtering and identity-margin in slot fallback, but that requires fresh forensics from a real run first. With v137 telemetry on the pass row we can decide post-rerun whether `coord_source` actually lands on `heuristic` or on a wrong `plate-slot-fallback` for speakers 1+2 before changing the matcher.

## Success criteria

After clean rerun of the scene:
- `dialog_shots.passes[*].v137_mapping.coord_source` populated for every speaker.
- All 4 speakers show visible mouth movement.
- Total wall-clock < 15 min.
