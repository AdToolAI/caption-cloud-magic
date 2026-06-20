---
name: v139 Stage 1 — Brakes released
description: Targeted fixes for the 17-min serial-mode pipeline; Stage 2/3 (mass code deletion) deferred to a follow-up after verification
type: feature
---

# v139 Stage 1 — Brakes Released

Surgical fixes applied without touching the working v60/v69/v130/v136 dispatch path. The bigger consolidation (delete ~5,000 dead lines, collapse strategies) is deferred until a successful 4-speaker scene proves Stage 1 didn't regress anything.

## What changed

### `compose-dialog-segments/index.ts`

1. **Version bump** `:124` → `COMPOSE_DIALOG_SEGMENTS_VERSION = "v139.0"`
2. **Fix C1 (Face-gate log truthful)** `:2359-2418`
   - Removed `console.error("FACE-GATE BLOCK …")` from the `gateOne` failure branch.
   - Log is now emitted ONCE after the v119 demote decision:
     - `v139_face_gate_SOFT_WARN` when `plateIdentityAuthoritative`
     - `FACE-GATE BLOCK (hard)` only when v119 did NOT demote
3. **Fix C7 (COORD REFRESH scoped)** `:2561-2583`
   - Loop now skips with `if (p.idx !== currentPassIdx) continue;` — sibling passes' preclips are no longer invalidated mid-flight.
   - Pixel threshold raised from sub-pixel `Math.round()` to 8 px Manhattan.
4. **Batch-preclip code default ON** `:3081-3095`
   - If DB row missing → treated as ON. Only explicit `false` disables.
5. **Fanout log marker `PLAN_D_FANOUT_BLOCKED_V128` → `v139_fanout_active`/`PLAN_D_FANOUT_BLOCKED_V139`** `:5671-5719`
   - Active path log includes `env` + `db_force` for forensic attribution.

### Database (`system_config`)

Migration `20260620…_v139_pipeline_defaults.sql` upserts:
- `composer.batch_preclip_render = true`
- `composer.parallel_sync_so_passes = true`
- `composer.plan_d_fanout_force_enable = true`
- `composer.sync_so_concurrency_cap = 2`

## Expected runtime impact

| Scenario | Before | After (Stage 1) |
|----------|--------|-----------------|
| 4-speaker dialog scene | 17–23 min (SERIAL) | 6–9 min (parallel cap 2 + batch preclip) |
| 2-speaker dialog scene | 8–12 min | 4–6 min |
| Sibling preclip re-renders per advance | 3× (always) | 0× (only current pass) |

## Verification checklist (next user run)

Expected logs in order:
1. `plan_b_B_batch_preclip_complete ok=N/N` — exactly once, near start
2. `DISPATCH pass=0/N model=sync-3` for pass 0
3. `v139_fanout_active cap=2 fanout_size=2` (or higher)
4. `DISPATCH pass=1/N` within ~250ms of pass 0
5. `v139_face_gate_SOFT_WARN` OR no face-gate log if all passes clean — but NEVER `FACE-GATE BLOCK` followed by `SOFT_WARN`
6. **Never** `PLAN_D_FANOUT_BLOCKED_V139`
7. **Never** `v128 ADVANCE COORDS REFRESH + PRECLIP INVALIDATE` for pass `N` when current dispatch is for pass `M ≠ N`

If any of (3,4,6,7) is violated → roll back via `composer.batch_preclip_render = false` or `composer.parallel_sync_so_passes = false` in `system_config`.

## What is explicitly NOT done in Stage 1

- 110-line dead `if (canRetry)` block in `sync-so-webhook` (still present, behind `canRetry = false`)
- v30/v37/v61 variant ladder (still computed, voided)
- `LIPSYNC_MODEL` / `LIPSYNC_FALLBACK_MODEL` constants (still in file, unused)
- `isV41Retry`, `useV41Official`, `forceMultipass`, `repairAudio` body flags (still accepted)
- Strategy consolidation to a single `coords-pro` constant
- Memory file consolidation into `CANONICAL.md`

These are Stage 2/3, gated on a successful v139 Stage 1 verification run.
