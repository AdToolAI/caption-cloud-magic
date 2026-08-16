# v431 G3.2.2-F1 — Mux/Stitch Terminalization Follow-up
## Analysis / Contract Lock

**Status:** F1 ANALYSIS / CONTRACT GO — STOP for Review  
**Scope:** Read-only analytical deliverable. No code changes in this step.  
**Resmoke scene:** `be06d0fd-85ec-4822-a18b-ad32e7c82562`  
**Run:** `f7c0eb3b-06be-4106-9932-308cfc5b3bf0`, plate generation `2`  
**T0 (RS3 effective epoch):** `2026-08-15T21:57:44Z`  

---

## 1. Executive Summary

The G3.2.2 resmoke completed functionally green: Plate → sync_segment → audio_mux → Stitch produced a final clip and the scene reached `pipeline_state = complete`.  
However, three structural deviations from the G3.2.2 contract were observed:

1. `dialog_shots.audio_mux.mux_dispatch_requested_at` was lost.
2. The `audio_mux` ledger job (`ad4da886-6b13-41cd-9d8a-bee424a17293`) remained at `dispatched`; it was never terminalized.
3. The scene completion was written by a legacy direct-update path in `remotion-webhook` (`dialog-stitch` branch); `composer_finalize_lipsync_scene` was not invoked.

This document proves the root cause, locks the authoritative terminalization contract, and defines the invariant that any F1 implementation must satisfy.

---

## 2. Root Cause: `mux_dispatch_requested_at` Loss

### 2.1 Where the claim is set

`composer_apply_sync_segment_result` writes the mux hand-off claim **inside the same transaction** that marks the last sync pass done:

```sql
_ds := jsonb_set(_ds, ARRAY['audio_mux'],
                 COALESCE(_ds->'audio_mux', '{}'::jsonb), true);
_ds := jsonb_set(_ds, ARRAY['audio_mux', 'mux_dispatch_requested_at'],
                 to_jsonb(now()::text), true);
UPDATE public.composer_scenes SET dialog_shots = _ds, updated_at = now()
WHERE id = _scene.id;
```

At this point `dialog_shots.audio_mux` contains **only** `mux_dispatch_requested_at`.

### 2.2 Where the claim is overwritten

`render-sync-segments-audio-mux` constructs a new `audio_mux` object and replaces the previous one:

```ts
const updatedState: DialogShotsState = {
  ...state,
  status: "audio_muxing",
  audio_mux: {
    render_id: renderId,
    dispatched_at: new Date().toISOString(),
  },
};
await supabase.from("composer_scenes").update({
  dialog_shots: updatedState,
  ...
}).eq("id", sceneId);
```

Because `audio_mux` is assigned as a **whole object** (`{ render_id, dispatched_at }`), the `mux_dispatch_requested_at` field set by the apply RPC is erased.

### 2.3 Evidence from production resmoke

| Timestamp (UTC) | Source | Event |
|---|---|---|
| 22:53:27.277862 | `composer_apply_sync_segment_result` | sync_segment job `a6115db3...` marked `succeeded` |
| 22:53:27.410504 | `sync-so-webhook` | `acquireLedgerJob('audio_mux')` → job `ad4da886...` |
| 22:53:27.410504 | `composer_apply_sync_segment_result` | `mux_dispatch_requested_at` written |
| 22:53:30.xxx | `render-sync-segments-audio-mux` | `dialog_shots.audio_mux` overwritten with `{render_id, dispatched_at}` |
| 22:53:44.968374 | `remotion-webhook` | audio_mux callback observed, job `ad4da886...` bound |

Current DB state confirms the loss:

```json
{
  "audio_mux": {
    "render_id": "a15c1f95-d0f3-4d78-9d9a-e1897a039e63",
    "dispatched_at": "2026-08-15T22:53:30.xxxZ"
  }
}
```

`mux_dispatch_requested_at` is absent.

### 2.4 Why this matters

`mux_dispatch_requested_at` is the **re-drivable request claim**. It records the exact moment the Sync-Segment apply decided that all passes were terminal and that an audio mux is required. Without it:

- Crash-recovery cannot distinguish "mux requested but not yet dispatched" from "mux never requested".
- The ledger job has no stable coupling to the scene-level hand-off timestamp.
- Future idempotency checks that rely on the request claim will fail or duplicate.

---

## 3. Root Cause: `audio_mux` Ledger Job Stuck at `dispatched`

### 3.1 Ledger lifecycle observed

```
base_video   ad2707e0...  succeeded
sync_segment a6115db3...  succeeded
audio_mux    ad4da886...  dispatched   ← never completed
```

### 3.2 Where binding happens

`render-sync-segments-audio-mux` calls `bindLedgerExternalJob` after invoking Lambda:

```ts
await bindLedgerExternalJob(supabase, v431MuxLedgerJobId, renderId);
```

This updates the ledger row to `status = 'dispatched'` and sets `external_job_id = renderId`.

### 3.3 Where completion should happen

The ledger row must be terminalized when the stitch callback arrives. The current `remotion-webhook` `dialog-stitch` branch does **not** call `completeLedgerJobImmediate` or any equivalent RPC.

Current `dialog-stitch` success handler:

```ts
await withDialogLock(supabaseAdmin, composerSceneId, 'webhook-stitch', async () => {
  const { data: sceneRow } = await supabaseAdmin
    .from('composer_scenes')
    .select('dialog_shots, lip_sync_status, lip_sync_applied_at')
    .eq('id', composerSceneId)
    .maybeSingle();
  const prevState = (sceneRow?.dialog_shots as any) || {};
  if ((sceneRow as any)?.lip_sync_status === 'canceled' || prevState?.status === 'canceled') {
    return;
  }
  const nowIso = new Date().toISOString();
  await supabaseAdmin.from('composer_scenes').update({
    ...materializeCompatibilityOutput('processed', {
      baseUrl: prevState?.source_clip_url ?? null,
      processedUrl: finalOutputUrl,
    }),
    clip_status: 'ready',
    lip_sync_source_clip_url: prevState?.source_clip_url ?? null,
    lip_sync_applied_at: nowIso,
    lip_sync_status: 'done',
    twoshot_stage: 'done',
    clip_error: null,
    dialog_shots: {
      ...prevState,
      status: 'done',
      final_url: finalOutputUrl,
      finished_at: nowIso,
    },
    updated_at: nowIso,
  }).eq('id', composerSceneId);
});
```

No ledger completion. No call to `composer_finalize_lipsync_scene`.

### 3.4 Consequence

The `audio_mux` ledger job is left in a non-terminal state. From the ledger perspective the mux step is still in flight, even though the scene is `complete`. This breaks:

- G3.2.2’s provenance chain (the final callback is not reflected in the ledger).
- Any future retry/re-run logic that uses the ledger as the source of truth.
- Exactly-once guarantees: a later duplicate stitch callback or a recovery cron could attempt to re-finalize.

---

## 4. Provenance Transport Proof: Sync Segment → Audio Mux → Stitch

The following chain is proven by code inspection and DB evidence.

### 4.1 Sync segment apply

- `sync-so-webhook` receives Sync.so `COMPLETED` callback.
- It calls `composer_apply_sync_segment_result(pipeline_job_id, external_job_id, 'ssw:success', ...)`.
- The RPC locks the ledger job and the scene, verifies `run_id`/`plate_generation`, marks the pass done, and returns a verdict.
- For the resmoke, the verdict was `dispatch_mux`.

Evidence: `composer_callback_observations` row `40632cdc-4a92-49ae-98e0-04c9eab19668` records `verdict = bound`, `stage = sync_segment`, `pipeline_job_id = a6115db3...`.

### 4.2 Mux dispatch

- `sync-so-webhook` post-commit effect `dispatchAudioMux` calls `acquireLedgerJob('audio_mux')`.
- On success it fires `render-sync-segments-audio-mux` with `pipeline_job_id` in the body.
- Evidence: ledger job `ad4da886...` created at 22:53:27.410504 with `metadata.dispatcher = "sync-so-webhook"`.

### 4.3 Mux binding

- `render-sync-segments-audio-mux` reads the incoming `pipeline_job_id`, passes the RS3 fence, invokes Remotion Lambda, then calls `bindLedgerExternalJob(jobId, renderId)`.
- Evidence: `composer_callback_observations` row `11ea9588-7690-4ed1-9486-77a832827056` records `verdict = bound`, `stage = audio_mux`, `pipeline_job_id = ad4da886...`, `external_job_id = a15c1f95...`.

### 4.4 Stitch callback

- Remotion Lambda renders `DialogStitchVideo` with `source = "dialog-stitch"`.
- On completion it POSTs to `remotion-webhook` with `customData.stage = "sync_segments_audio_mux"` and `customData.pipeline_job_id = ad4da886...`.
- The webhook extracts `pipelineJobId` and enters the `isDialogStitch` branch.

### 4.5 Provenance gap

The `pipeline_job_id` **arrives** at the stitch callback, but the current handler:

- Does not validate it against the ledger row.
- Does not complete the ledger job.
- Does not use it as the atomic owner of scene finalization.

This is the structural gap F1 must close.

---

## 5. Atomic Finalization Owner Contract

### 5.1 Invariant

> **The `audio_mux` ledger job is the sole owner of scene terminalization for the sync-segments audio mux stitch path.**

No other writer may move the scene to `complete` for this path. The `remotion-webhook` `dialog-stitch` branch must delegate the terminalization decision to the ledger job.

### 5.2 Required interface

Introduce a single atomic RPC (or reuse the existing contract name):

```sql
composer_finalize_lipsync_scene(
  _pipeline_job_id uuid,
  _external_job_id text,
  _scene_id uuid,
  _final_url text,
  _write_id text
)
```

Behavior:

1. Lock the ledger job `FOR UPDATE`.
2. Reject if `stage != 'audio_mux'`.
3. Reject if `external_job_id` mismatch.
4. Reject if `run_id` or `plate_generation` do not match the scene.
5. Reject if the job is already terminal (`succeeded`, `failed`, `stale`, `cancelled`).
6. Update the ledger job to `succeeded` with `completed_at = now()`.
7. In the same transaction, update `composer_scenes`:
   - `pipeline_state = 'complete'` (or legacy equivalents)
   - `lip_sync_status = 'done'`, `twoshot_stage = 'done'`, `clip_status = 'ready'`
   - `dialog_shots.status = 'done'`
   - `dialog_shots.audio_mux.finished_at = now()`
   - `dialog_shots.final_url = _final_url`
   - `clip_url = _final_url`
   - `lip_sync_applied_at = now()`
8. Audit via `composer_scene_transition_log` with `write_id = 'f1:stitch:done'` and `source_signature = 'g322_stitch_finalize'`.

### 5.3 Why the RPC must be the atomic owner

- The ledger job is already the provenance carrier from dispatch through binding.
- Making the RPC the sole finalizer prevents the legacy direct-update path from racing.
- The transaction guarantees that the scene cannot be marked `complete` unless the ledger job is simultaneously `succeeded`.
- Duplicate stitch callbacks become idempotent: the second call finds the job already `succeeded` and returns `already_completed`.

### 5.4 Crash-test contract

The crash test for this path is:

> **At any point before the RPC returns, kill the edge function. After restart, the system must observe the ledger job status and decide:**
> - `succeeded` → scene is complete; no further action.
> - `dispatched` (and external job terminal) → re-drive finalization via the same RPC.
> - `dispatched` (and external job still running) → wait.
> - `failed`/`stale` → follow retry policy.

The crash test must **not** inspect `dialog_shots.status` or `lip_sync_status` as the primary signal; the ledger job is the source of truth.

---

## 6. Race / Duplicate Matrix

| Scenario | Caller | Ledger state before | Expected outcome | Reason |
|---|---|---|---|---|
| First stitch success | `remotion-webhook` | `dispatched`, `external_job_id` matches | RPC succeeds, scene → `complete`, ledger → `succeeded` | Normal path |
| Duplicate stitch success | `remotion-webhook` | `succeeded` | RPC returns `already_completed`, no scene mutation | Idempotency via ledger state |
| Stitch success with wrong `external_job_id` | `remotion-webhook` | `dispatched`, `external_job_id` differs | Reject `wrong_job` | Provenance mismatch |
| Stitch success for stale run/generation | `remotion-webhook` | `dispatched` but scene `active_run_id`/`plate_generation` changed | Reject `stale_run` / `stale_generation` | RS3 / reset protection |
| Stitch success while scene canceled | `remotion-webhook` | `dispatched` but scene `lip_sync_status = 'canceled'` | Reject `canceled` | Cancel guard |
| Manual DB write tries to set `complete` | any legacy path | `dispatched` | Must be blocked by contract; only RPC may finalize | Sole-owner rule |
| `render-sync-segments-audio-mux` re-invoked while render in flight | cron/recovery | `dispatched`, render still pending | Skip dispatch; do not create new ledger job | Idempotency via existing render_id |
| `render-sync-segments-audio-mux` re-invoked after render completed but before RPC | cron/recovery | `dispatched`, render `completed` | Re-drive RPC, which returns `already_completed` | Recovery path |
| Sync-segment apply re-executes and re-dispatches mux | `sync-so-webhook` | `succeeded` | `acquireLedgerJob` returns `already_in_flight` / `predecessor_exists`; no new dispatch | Duplicate suppression |

---

## 7. Required Code Changes (for F1 implementation, not this step)

### 7.1 `render-sync-segments-audio-mux`

Change the `audio_mux` object construction from whole-object replacement to **merge** so `mux_dispatch_requested_at` is preserved:

```ts
const updatedState: DialogShotsState = {
  ...state,
  status: "audio_muxing",
  audio_mux: {
    ...state.audio_mux,
    render_id: renderId,
    dispatched_at: new Date().toISOString(),
  },
};
```

### 7.2 `remotion-webhook` (`dialog-stitch` branch)

Replace the direct `composer_scenes.update` finalization with a call to `composer_finalize_lipsync_scene`:

```ts
const finalizeResult = await supabaseAdmin.rpc('composer_finalize_lipsync_scene', {
  _pipeline_job_id: pipelineJobId,
  _external_job_id: renderId,
  _scene_id: composerSceneId,
  _final_url: finalOutputUrl,
  _write_id: 'f1:stitch:done',
});
```

Keep the `video_renders` update for `pendingRenderId` outside the RPC if necessary, but the scene terminalization must be atomic inside the RPC.

### 7.3 `composer_finalize_lipsync_scene` (new or existing contract)

Implement per section 5.2. If the function already exists as a stub, fill it. If it does not exist, create it in a migration.

### 7.4 Optional: `dialog_shots.audio_mux` schema

Add a stable contract for the `audio_mux` object:

```ts
interface AudioMuxState {
  mux_dispatch_requested_at?: string;   // set by sync-segment apply
  render_id?: string;                 // set by render-sync-segments-audio-mux
  dispatched_at?: string;               // set by render-sync-segments-audio-mux
  finished_at?: string;                 // set by composer_finalize_lipsync_scene
  external_job_id?: string;             // mirror of ledger external_job_id
}
```

---

## 8. Acceptance Criteria

- [ ] `mux_dispatch_requested_at` is present in `dialog_shots.audio_mux` after a fresh mux dispatch.
- [ ] After stitch success, the `audio_mux` ledger job is `succeeded` with `completed_at` set.
- [ ] `composer_scene_transition_log` contains a `f1:stitch:done` entry for the final transition to `complete`.
- [ ] Crash test (edge function killed before RPC returns) leaves the scene either `complete` with ledger `succeeded`, or recoverable via the same RPC.
- [ ] Duplicate stitch callbacks do not produce duplicate ledger completions or scene mutations.
- [ ] Legacy direct-update path in `remotion-webhook` is removed or guarded to call the RPC.

---

## 9. Scope Protection

This document is **analytical**. No migration, edge function, or SQL change is made in this step. The implementation step following this review will be scoped as **v431 G3.2.2-F1.IMP** and will touch only:

- `supabase/functions/render-sync-segments-audio-mux/index.ts`
- `supabase/functions/remotion-webhook/index.ts`
- A new or existing `composer_finalize_lipsync_scene` RPC migration
- Optional TypeScript interface tightening for `AudioMuxState`

No other lip-sync writers, plate paths, or dialog-segment paths are in scope.

---

## 10. References

- `docs/v431-g3-2-2-report.md` — parent G3.2.2 report
- `docs/v431-run-contract.md` — run/provenance contract
- `supabase/migrations/20260815185301_73dee86e-aa8f-4fc1-93c7-c3cfb602ce00.sql` — `composer_apply_sync_segment_result`
- `supabase/functions/sync-so-webhook/index.ts` — `dispatchAudioMux`
- `supabase/functions/render-sync-segments-audio-mux/index.ts` — mux dispatch and `audio_mux` overwrite
- `supabase/functions/remotion-webhook/index.ts` — `dialog-stitch` branch
- `supabase/functions/_shared/v431-ledger.ts` — `bindLedgerExternalJob`, `completeLedgerJobImmediate`
