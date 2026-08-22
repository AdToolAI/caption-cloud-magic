# Read-only Audit: Motion Studio Rerender vs. Lip-Sync-Only Reset

No code, DB, storage, provider or credit state was touched. All statements below come from the current sources named in each line.

## Verdicts

- **Full scene rerender: PARTIAL** — logical invalidation is sound and race-safe; physical purge and continuity-frame clearing are incomplete.
- **Lip-sync-only retry: PARTIAL** — plate/run are correctly preserved and callbacks are fenced, but it also drops identity/geometry context and leaves dispatch locks behind; one caller path is dead.

---

## 1) Full scene rerender

Path: `SceneCard.handleFullSceneRegenerateAction` → `src/lib/composer/startSceneGeneration.ts` → `composer-start-scene-generation/index.ts` → `startSceneRun()` (`_shared/scene-run.ts` → RPC `composer_start_scene_run`) → `hardResetScene()` (`_shared/scene-hard-reset.ts`, `generationOverride`) → `transitionScene('plate_queued')` → `compose-video-clips` with `run_context`.

What happens (evidence: `composer_start_scene_run` DB function, `_shared/scene-hard-reset.ts` L470–650):

| Item | Effect |
| --- | --- |
| Scene row | kept; no delete |
| `plate_generation` / `active_run_id` | bumped + fresh UUID **inside one row-locked transaction, before any teardown** (`composer_start_scene_run`) |
| `plate_ready_generation`, `plate_ready_at` | nulled |
| `clip_url` / `base_video_url` / `processed_video_url` | cleared as one triple via `materializeCompatibilityOutput('clear')` |
| `preview_clip_url`, `clip_error`, `replicate_prediction_id`, `retry_count` | cleared |
| `first_frame_url`, `last_frame_url` | **NOT cleared** (only `beginSceneRun` clears them) — gap |
| `dialog_shots`, `dialog_takes`, `twoshot_stage`, `lip_sync_status/_source_clip_url/_applied_at` | cleared |
| `audio_plan` / `scene_assets` | user-authored keys kept, derived keys stripped (`stripDerivedAudioPlan`, `stripDerivedSceneAssets`) |
| Dispatch locks | `dialog_dispatch_locks` + `syncso_inflight_jobs` deleted for the scene |
| Provider jobs | `failLipSync()` cancels collected Sync.so ids best-effort; `replicate_prediction_id` cleared |
| Plate attempts / renders | superseded by trigger + `supersedeOpenPlateAttempts`; open `video_renders` of older generations marked `failed:v380_superseded_*` |
| Storage | `purgeArtifacts()` deletes matching objects in 8 bucket/prefix pairs |
| V434 pins | untouched (`ai-videos/<uid>/v434/...` is outside the purge prefixes) — correct, evidence stays immutable |
| Credits | `decideRefund()`: refund only for an open, undelivered job; `skipped_delivered` / `skipped_already_refunded` / `nothing_open` otherwise |
| Continuity | `propagate_continuity_staleness(scene, null)` called only here |

Race analysis: the generation bump is committed **before** cancels, so an old plate callback is inert regardless of cancel success — `compose-clip-webhook` L130–148 rejects any callback whose `run_id`/`generation` do not match the live row. Old Sync.so callbacks are fenced in `sync-so-webhook` L634–664 by "`dialog_shots` purged or job id not in the current run".

### Concrete gaps

1. `first_frame_url` / `last_frame_url` survive the hard reset. `_shared/transition-frame.ts` L71–75 reuses the previous scene's `last_frame_url`, which can now point to bytes the purge deleted or to the previous generation's look.
2. `purgeArtifacts()` uses a non-recursive `storage.list(prefix, {limit:1000})` and filters names containing the scene id, so objects nested one level deeper (e.g. `composer/<projectId>/<sceneId>/...`) are never listed and never deleted. Physical purge is therefore partial; logical invalidation still holds.
3. Purge/cancel errors set `ok:false` but `composer-start-scene-generation` aborts only on `update:` errors — a partially failed teardown still dispatches (deliberate, but it means "deleted_objects" is not a guarantee).
4. Direct `composer-hard-reset-scene` (abandon path, `hardResetSceneJob`) bumps the generation but leaves `active_run_id` pointing at the old run; the webhook guard is an AND over run+generation so nothing leaks, but the row is inconsistent.
5. Open question, not verified in this audit: whether a v427 credit reservation is released on the hard-reset path (`_shared/v427-credit-contract.ts` holds the settle/release helpers; no call site found in `scene-hard-reset.ts`).

---

## 2) Lip-sync-only retry

Path: `SceneCard.cleanRestartLipSync({force:true})` / `useResetLipSync` / `lipsyncReset.resetSceneLipSync` → `reset-lipsync-scene` → RPC `composer_reset_lipsync_with_attempt_cancellation` → auto-trigger (`useTwoShotAutoTrigger`, 2.5 s poll) → `compose-dialog-segments`.

Cleared by the RPC (single commit, advisory scene lock): `dialog_shots`, `twoshot_stage`, `replicate_prediction_id`, `processed_video_url`, `lip_sync_source_clip_url`, `lip_sync_applied_at`, `clip_error`; `lip_sync_status → 'pending'`; open `sync_segment` / `audio_mux` ledger attempts → `cancelled` / `error_code='user_reset'` with callback claim tokens nulled.

Preserved: `plate_generation` and `active_run_id` are **unchanged** (guarded: mismatch returns `stale_reset`); `clip_url`/`base_video_url` are restored to the base plate (`lip_sync_source_clip_url` when `force`, else current `clip_url`), `clip_status → 'ready'`; `reference_image_url`, `scene_assets`, `first_frame_url`, `last_frame_url` untouched; no storage purge at all, so plate, preclips and anchors physically survive; `propagate_continuity_staleness` is deliberately **not** called.

Fencing: the `audio_plan.twoshot.rs3_reset` marker (reset_id, run_id, plate_generation, authorized segments, `mux_rearm_allowed`) authorizes exactly one successor per stage/segment and makes every pre-reset attempt identifiable (`composer_rs3_is_pre_reset_attempt`); late Sync.so callbacks additionally hit the purged-`dialog_shots` guard.

Plate reuse: `compose-dialog-segments` reads `clip_url` / `lip_sync_source_clip_url` and never starts a plate render (no `startSceneRun`/plate dispatch in that function) — the same plate is reused.

Refund: claimed exactly once inside the commit (`refund_claimed`), paid out afterwards by the edge function.

### Concrete gaps

1. The RPC strips `faceMap` **and** `anchor_face_audit` from `audio_plan.twoshot`. Identity/geometry context is therefore *not* preserved and must be re-derived on the next pass — exactly the surface where the v117 plate gate previously tripped. This contradicts the intended contract.
2. `dialog_dispatch_locks` are not deleted on this path (only in `scene-hard-reset.ts` L532), so a stale lease can defer the rearm until the watchdog reclaims it.
3. `beginSceneRun()` (`_shared/scene-run-begin.ts` L60–80) calls `reset-lipsync-scene` with the **service-role key** as Bearer, while the function requires a real user JWT (`auth.getUser()` → 401). That cancel-inflight step is a permanent no-op on the legacy `compose-video-clips` path.
4. Refund durability: if the function crashes between the commit (`refund_claimed = true`, `dialog_shots = NULL`) and the wallet update, the claim is consumed but no credits land, and a retry sees `cost = 0`.
5. `syncso_inflight_jobs` rows are removed only for job ids discoverable from the pre-reset `dialog_shots` / RPC output; unknown ids stay until the watchdog cleans up.

---

## Contract check

- "Full rerender invalidates the old final scene and creates a new run/generation" — satisfied logically and atomically; deviations are the surviving continuity frames and the shallow storage purge.
- "Lip-sync-only preserves plate + identity/geometry and replaces only lip-sync-derived artifacts" — plate/run/generation preservation is exact; the identity/geometry part (`faceMap`, `anchor_face_audit`) is violated by design of the current reset field set.

## Suggested follow-up gate (not executed here)

1. Clear `first_frame_url`/`last_frame_url` in `hardResetScene` and make `purgeArtifacts` recursive.
2. Keep `faceMap`/`anchor_face_audit` across an RS3 lip-sync reset (or re-pin them to the plate generation) and drop `dialog_dispatch_locks` on that path.
3. Fix or remove the service-key call to `reset-lipsync-scene` in `beginSceneRun`.
4. Make the RS3 refund payout durable (ledger row instead of a consumed in-place claim).
5. Verify v427 reservation release on the hard-reset path.
