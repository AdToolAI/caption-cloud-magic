# v431 G3.2.2-F1.IMP — Implementation Report

**Status:** IMPLEMENTED — STOP before Deploy / Production Resmoke  
**Note:** Lovable Cloud uses a single production database. The SQL migration is therefore **already live**; the RPC is dormant because the updated Edge Functions are not yet deployed.  
**Scope:** Atomic Stitch Finalizer + `audio_mux` narrow patch + `dialog-stitch` writer migration.

---

## 1. Deliverables

| # | Deliverable | Location | State |
|---|---|---|---|
| 1 | Atomic finalizer RPC | `supabase/migrations/20260816185114_372f1547-9081-4108-a01c-6129b11ae80e.sql` | **Live in DB** |
| 2 | `audio_mux` narrow patch | `supabase/functions/render-sync-segments-audio-mux/index.ts` | Merged, not deployed |
| 3 | `dialog-stitch` fail-closed migration | `supabase/functions/remotion-webhook/index.ts` | Merged, not deployed |
| 4 | Contract / race / merge tests | `supabase/migrations/20260816185737_093b00f6-fdaf-438b-bdea-e153d5aa71f8.sql` | **Live in DB** |
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

ACL: execute granted **only** to `service_role`; revoked from PUBLIC, anon, and authenticated.

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

- `pipeline_job_id` present and `stage === 'sync_segments_audio_mux'` → calls `composer_finalize_lipsync_scene`.
- `pipeline_job_id` missing or `stage !== 'sync_segments_audio_mux'` → logs an observation with `reason: missing_pipeline_job_id` / `wrong_stage` and returns without mutating the scene.
- `no_ledger_job` or any non-`finalized`/`already_completed` verdict → returns a non-2xx response so the caller can retry or investigate.

No generic legacy fallback exists for current callbacks. A legacy direct update is only permissible with an explicit, pre-existing G0-Grandfather proof, which `dialog-stitch` callbacks do not have.

---

## 3. Evidence collected for the three deploy-gate questions

### 3.1 Vitest baseline comparison

**Command:** `npx vitest run --reporter=basic`

| Commit | Passed | Failed | Failure entries |
|---|---|---|---|
| Pre-F1 baseline `b142c81c4` | 724 | 40 | 69 |
| HEAD (F1.IMP) | 720 | 44 | 73 |

`comm -13` comparison shows **4 new full-suite failures** in HEAD:

- `src/lib/composer/__tests__/clientReaderContract5E.test.ts` — 2 timeout failures
- `src/lib/composer/__tests__/lipSyncIntentGateScanner.test.ts` — 1 timeout failure
- `src/test/brand-consistency.test.ts` — 1 timeout failure

**Important:** When the same 3 files are run individually, **all 8 tests pass on both baseline and HEAD** (baseline ~12.7s, HEAD ~13.2s). The failures are therefore load-dependent timeouts in the full-suite run, not functional regressions introduced by F1.IMP.

**G3 / RS3 / Frozen suites run individually on HEAD:**

- `lipsyncFrozenContract.test.ts` — 10 passed
- `v427PipelineJobContract.test.ts` — 8 passed
- `v431LedgerAcquireContract.test.ts` — 9 passed
- `v427CallbackGuardContract.test.ts` — 7 passed
- `continuityChainContract.test.ts` — 14 passed

**Total: 48 passed, 0 failed.**

### 3.2 Deno baseline comparison

**Command:** `deno check supabase/functions/remotion-webhook/index.ts supabase/functions/render-sync-segments-audio-mux/index.ts`

Both baseline and HEAD report **exactly the same 6 diagnostics**:

- 2× `TS2345` in `_shared/dialog-lock.ts` (`try_acquire_dialog_lock` / `release_dialog_lock` RPC typing)
- 1× `TS2304` in `remotion-webhook/index.ts:110` (`hasBackgroundMusic` not defined)
- 3× `TS2345` in `remotion-webhook/index.ts` (`SupabaseClient` type mismatch for `withDialogLock`)

No new Deno diagnostics were introduced by F1.IMP.

### 3.3 DB contract tests and cleanup

The 8 contract tests are deployed as migration `20260816185737_093b00f6-fdaf-438b-bdea-e153d5aa71f8.sql`. They run in a `DO` block as `service_role` during migration execution and are self-cleaning.

**Verified post-migration:**

- `composer_finalize_lipsync_scene` exists in `pg_proc` with:
  - `prosecdef = true`
  - `proconfig = {"search_path=pg_catalog, public"}`
  - args: `_pipeline_job_id uuid, _external_job_id text, _scene_id uuid, _final_url text, _write_id text`
- Privileges:
  - `service_role` → `EXECUTE = true`
  - `authenticated` → `EXECUTE = false`
  - `anon` → `EXECUTE = false`
- Leftover check after migration:
  - `composer_scenes` with `order_index = 999999` → 0 rows
  - `composer_pipeline_jobs` with `idempotency_key LIKE 'f1-test-%'` → 0 rows
  - `composer_scene_transition_log` for test scenes → 0 rows

**Crash / rollback smoke:**

A manual session-level rollback smoke could not be executed by the restricted psql role because the RPC is correctly `service_role`-only. The atomicity guarantee is structurally proven by the function source:

- The function is a single PL/pgSQL block with no `EXCEPTION` handler around the mutation statements.
- The job update (`UPDATE composer_pipeline_jobs`) and the scene update (`UPDATE composer_scenes`) share the same transaction boundary.
- Any error after the first `UPDATE` rolls back the entire RPC call, leaving both the ledger job and the scene unchanged.

This matches the F1-Contract §6 requirement that the finalizer is atomic and that there is no observable half-written state.

---

## 4. Provenance transport verification

The `render-sync-segments-audio-mux` dispatcher attaches the authoritative ledger job ID to the Remotion render webhook:

```typescript
customData: {
  pending_render_id: renderId,
  out_name: outName,
  user_id: userId,
  source: "dialog-stitch",
  composer_scene_id: sceneId,
  composer_project_id: (scene as any).project_id,
  stage: "sync_segments_audio_mux",
  ...(v431MuxLedgerJobId ? { pipeline_job_id: v431MuxLedgerJobId } : {}),
},
```

The `remotion-webhook` `dialog-stitch` success branch reads `customData.pipeline_job_id` and passes it unchanged to `composer_finalize_lipsync_scene`. No additional provenance transport code was required.

---

## 5. Fail-closed webhook verification

In `remotion-webhook/index.ts` the `isDialogStitch` success branch:

1. Updates `video_renders` only (not `composer_scenes`).
2. Requires `composerSceneId`, `stage === 'sync_segments_audio_mux'`, and `pipelineJobId`.
3. If any are missing → logs `observeCallbackProvenance(...)` and returns without mutating the scene.
4. Calls `composer_finalize_lipsync_scene` with `_write_id: 'stitch:done'`.
5. Returns `500` on RPC error and `409` on any verdict other than `finalized` / `already_completed`.

There is **no** `materializeCompatibilityOutput` or other scene-mutating fallback for the normal current-callback path.

---

## 6. Deployment readiness

- G3.1, RS3, Sync-Apply, and the front-half of the pipeline remain frozen.
- F1.IMP changes are localized to:
  - one new RPC (already live in DB),
  - one narrow merge patch in the mux dispatcher,
  - one fail-closed branch in the stitch webhook.
- The DB side is live but dormant because the Edge Function changes are not yet deployed.
- No production resmoke has been run yet.

**Recommended next step:** Deploy the two Edge Functions (`render-sync-segments-audio-mux`, `remotion-webhook`), then run a controlled Production Resmoke for scene `be06d0fd-85ec-4822-a18b-ad32e7c82562` (or a fresh equivalent) to prove the full `Plate → sync_segment → audio_mux → Stitch → Finalizer` chain and verify that the `audio_mux` ledger job reaches `succeeded` atomically with the scene reaching `complete`.

---

## 7. STOP before Deploy

Per the implementation gate: **no deploy and no production resmoke in this step.** This report marks the STOP point. The code is ready for review and subsequent deploy.

---

## 8. Edge Deploy + Production Resmoke (F1 Hauptabnahme)

**T_F1_effective** = `2026-08-16T19:41:09Z` (zweiter Edge-Deploy erfolgreich:
`render-sync-segments-audio-mux`, `remotion-webhook`).

**Resmoke-Szene (frisch, ledger-frei vor Start):**
`3d91edf4-2d77-4c78-8856-915102722c84` (S02, Projekt `035273d7-ae9b-44e0-89e7-f9e28703530d`).
Single-Speaker, non-tight, intentional Lip-Sync, HappyHorse-Plate + ElevenLabs-Voice,
`engine_override = cinematic-sync`.

- **T_run_start** = `2026-08-16T20:05:00Z` (UI-Renderfreigabe im Confirm-Dialog)
  → `run_id = 3f540ba3-e41e-4685-81c2-b48bf20d05f3`, `generation = 2`
- **T_finalize** = `2026-08-16T20:11:11.248Z` (`stitch:done`, atomarer Commit)

### Front-Half (frozen — nur bestätigt)
| Stage | Job | Status | Bound |
|---|---|---|---|
| `base_video` | `25c2b6a0…` (ai-happyhorse, `291vtx7k7drmy0d01gps6rhc70`) | succeeded 20:08:07Z | verdict=bound |
| `sync_segment` | `7934bf3e…` (sync.so, `6dffc931…`) | succeeded 20:10:51Z | verdict=bound |
| `audio_mux` | `38e561e6…` (remotion, `2724237f…`) | dispatched 20:10:51Z | verdict=bound |

Genau ein `audio_mux`-Job, realer `render_id`. Kein zweiter Attempt.

### A — Narrow Patch (GRÜN)
`dialog_shots.audio_mux` nach Dispatch:
`mux_dispatch_requested_at = 2026-08-16T20:10:51.382Z`,
`dispatched_at = 2026-08-16T20:10:55.094Z`,
`render_id = external_job_id = 2724237f-ce34-4bda-9f5e-a936f77f193a`.
Alle drei gleichzeitig vorhanden → Merge statt Overwrite bestätigt.

### B — Ledger Finalization (GRÜN)
Derselbe Job `38e561e6…`: `dispatched → succeeded`, `completed_at = 2026-08-16T20:11:11.248Z`,
`callback_delivery_status = succeeded`, `attempt_no = 1`, kein zweiter Attempt.

### C — Atomic Scene Finalization (GRÜN)
`remotion-webhook` Log: `[dialog-stitch] finalize result … verdict:"finalized"` mit
`pipeline_job_id = 38e561e6…`, `external_job_id = 2724237f…`, Confirmation-scene_id korrekt,
finale URL `…/dialog-stitch-muxed-3d91edf4-…-1786911054427.mp4`, `_write_id = 'stitch:done'`.
Audit `composer_scene_transition_log`: `lipsync_running → complete`, `applied = true`,
`reason = finalized`, `source_signature = g322_stitch_finalize`, `caller_class = stitch_finalize`,
`caller_role = service_role`.
Danach: Ledger succeeded, `pipeline_state = complete`, `clip_status = ready`,
Compatibility Output gesetzt (`clip_url` + `dialog_shots.final_url` + `dialog_shots.status = done`;
das ist der im RPC festgelegte Ausgabevertrag — `processed_video_url` gehört nicht dazu).
„scene complete + audio_mux dispatched" trat zu keinem Zeitpunkt als persistierter Endzustand auf.

### D — Legacy ausgeschlossen (GRÜN)
`legacy_wrapper_7` erscheint genau einmal, und zwar als Start-Write
`idle → plate_queued` um 20:05:09Z (Run-Anlage, nicht Completion). Completion-Owner ist
ausschließlich `stitch:done` / `g322_stitch_finalize`. Kein Direct-Complete im Stitch-Branch.

### Duplicate-/Telemetry-Gates (GRÜN)
- Kein Duplicate-Stitch aufgetreten; nur ein `audio_mux`-Job existiert.
- Observations ab `T_F1_effective`: 3 Rows, alle `verdict = bound`;
  `missing_binding`, `job_not_found`, `wrong_job`, `stale_run`, `stale_generation`,
  `binding_pending`, `reinject_missing_pipeline_job_id` = 0.
- `missing_pipeline_job_id` = 0 (kein Logtreffer); der reale Stitch-Callback trug
  `pipeline_job_id` in `customData`.
- Mindestens ein bound Sync-Callback vorhanden; Stitch-Verdict = `finalized`.

### Nebenbefund (kein Blocker)
Beim Szenen-Setup zeigte der Lip-Sync-Toggle aus dem lokalen Draft-Cache `true`,
während die DB `false` hielt; das Hard-Gate `isLipSyncIntentional()` blockierte den
ersten Startklick still. Nach explizitem Off→On war der Zustand persistiert und konsistent.

**Ergebnis: G3.2.2-F1 DONE / FROZEN.**
