# v431 G3.2.2-F1.IMP — Implementation Report

**Status:** IMPLEMENTED — STOP before Deploy / Production Resmoke  
**Scope:** Atomic Stitch Finalizer + `audio_mux` narrow patch + `dialog-stitch` writer migration.

---

## 1. Deliverables

| # | Deliverable | Location | State |
|---|-------------|----------|-------|
| 1 | Atomic finalizer RPC | `supabase/migrations/20260816185114_372f1547-9081-4108-a01c-6129b11ae80e.sql` | Merged |
| 2 | `audio_mux` narrow patch | `supabase/functions/render-sync-segments-audio-mux/index.ts` | Merged |
| 3 | `dialog-stitch` fail-closed migration | `supabase/functions/remotion-webhook/index.ts` | Merged |
| 4 | Contract / race / merge tests | `tests/v431-g3-2-2-f1-contract-tests.sql` + migration-run | Passed |
| 5 | This report | `docs/v431-g3-2-2-f1-imp-report.md` | Done |

---

## 2. What changed

### 2.1 `public.composer_finalize_lipsync_scene`

New `SECURITY DEFINER` RPC. It is the **sole owner** of scene terminalization for the G3.2.2 sync-segments audio-mux stitch path.

Key behaviors (frozen in `docs/v431-g3-2-2-f1-contract.md`):

- `_write_id` is strictly allowlisted to exactly `stitch:done`.
- Authoritative `scene_id`, `run_id`, and `plate_generation` are read from the locked ledger job, not from the request.
- `_scene_id` is only a confirmation guard; mismatches return `wrong_job`.
- Closed From-State matrix: only `dispatched` and `dispatch_uncertain` are accepted.
  - `dispatch_uncertain` finalizes only when `external_job_id` matches exactly.
- `succeeded` → `already_completed` (idempotent, no re-mutation).
- `failed` / `stale` / `cancelled` / `replaced_by` / `lip_sync_status = 'canceled'` → `canceled`.
- RS3 epoch-aware: a marker alone does **not** cancel. Pre-reset attempts (`rs3_reset_id` mismatch) return `pre_reset_attempt`; post-reset attempts with matching `rs3_reset_id` proceed normally.
- On success: updates the ledger job to `succeeded` and the scene to `complete` in one commit, writes the final URL, preserves `dialog_shots->audio_mux->mux_dispatch_requested_at`, and logs the transition.

ACL: execute granted **only** to `service_role`; revoked from PUBLIC.

### 2.2 `render-sync-segments-audio-mux` narrow patch

Before the patch, the dispatcher overwrote `dialog_shots.audio_mux` as a whole object, which destroyed `mux_dispatch_requested_at` set earlier by `composer_apply_sync_segment_result`.

After the patch, the dispatcher merges with the existing `audio_mux` object:

```typescript
const updatedState: DialogShotsState = {
  ...state,
  status: "audio_muxing",
  audio_mux: {
    ...(state.audio_mux ?? {}),
    render_id: renderId,
    dispatched_at: new Date().toISOString(),
  },
};
```

### 2.3 `remotion-webhook` `dialog-stitch` branch

The legacy direct-update path for `isDialogStitch` has been removed. The branch is now fail-closed:

- `pipeline_job_id` present → calls `composer_finalize_lipsync_scene`.
- `pipeline_job_id` missing or `stage !== 'sync_segments_audio_mux'` → logs an observation with `reason: missing_pipeline_job_id` / `wrong_stage` and returns without mutating the scene.
- `no_ledger_job` or any non-`finalized`/`already_completed` verdict → returns a non-2xx response so the caller can retry or investigate.

No generic legacy fallback exists for current callbacks. A legacy direct update is only permissible with an explicit, pre-existing G0-Grandfather proof, which `dialog-stitch` callbacks do not have.

---

## 3. Test results

### 3.1 Contract / race / merge tests

Executed as a self-cleaning database migration (service_role context). All 8 scenarios passed:

1. Happy path: `dispatched` → `succeeded` + `complete`.
2. Duplicate callback: `succeeded` → `already_completed`.
3. Invalid `_write_id` → `invalid_write_id`.
4. Wrong `external_job_id` → `wrong_job`.
5. `_scene_id` confirmation guard mismatch → `wrong_job`.
6. `dispatch_uncertain` with matching `external_job_id` → `finalized`.
7. RS3 pre-reset attempt (`rs3_reset_id` mismatch) → `pre_reset_attempt`.
8. RS3 post-reset attempt with matching `rs3_reset_id` → `finalized`.

`mux_dispatch_requested_at` preservation was verified in scenario 1.

### 3.2 Static checks

- `tsgo` (frontend TypeScript): passed.
- `deno check` on the two touched edge functions: no **new** errors. The 6 reported errors are pre-existing in `dialog-lock.ts` and the unrelated `hasBackgroundMusic` reference at line 110.
- Vitest frozen suite: 721 passed, 43 failed. The failures are pre-existing and unrelated to F1.IMP (e.g., `materializeSceneOutput.test.ts` expects functions that have not changed here).

---

## 4. Deployment readiness

- G3.1, RS3, Sync-Apply, and the front-half of the pipeline remain frozen.
- F1.IMP changes are localized to:
  - one new RPC,
  - one narrow merge patch in the mux dispatcher,
  - one fail-closed branch in the stitch webhook.
- No production resmoke has been run yet.

**Recommended next step:** Deploy the edge functions and the SQL migration, then run a controlled Production Resmoke for scene `be06d0fd-85ec-4822-a18b-ad32e7c82562` (or a fresh equivalent) to prove the full `Plate → sync_segment → audio_mux → Stitch → Finalizer` chain and verify that the `audio_mux` ledger job reaches `succeeded` atomically with the scene reaching `complete`.

---

## 5. STOP before Deploy

Per the implementation gate: **no deploy and no production resmoke in this step.** This report marks the STOP point. The code is ready for review and subsequent deploy.
