# V438 — Pipeline State Contract: Current-Generation Plate Authority

Scope: close the state contract that V437 exposed. No progress-percentage cosmetics until the contract holds. V435 Phase 1 stays paused until V438 is green.

## Confirmed starting point

- `public.composer_state_from_legacy(...)` evaluates `twoshot_stage = 'master_clip' → audio_ready` and `= 'audio' → audio_prep` **before** any `clip_status` branch. The client mirror `deriveStateFromLegacy` in `src/lib/composer/sceneState.ts` has the same order. Neither receives `plate_generation` / `plate_ready_generation`, so neither can tell whether the plate belongs to the current run.
- `composer_substate_from_legacy` maps `twoshot_stage='failed' AND lip_sync_status='failed' → 'lipsync_failed'` unconditionally, with no plate-readiness precondition. Scene `e658509d` currently carries exactly that substate although it failed in the v117 plate gate with `plate_ready_generation = NULL`.
- `useTwoShotAutoTrigger` selects `clip_url, clip_status, twoshot_stage, …` but **not** `plate_generation` / `plate_ready_generation`; its audio-prep and lip-sync candidate filters gate on "a `clip_url` exists and the row is ready-equivalent" only.
- `usePipelineProgress` counts clip readiness via `legacyClipReadyEquivalentRow`, which returns `true` for `failed` scenes that still carry an output URL.

## What changes

### 1. Current-generation plate authority (core invariant)

Both derivation functions (SQL `composer_state_from_legacy` + TS mirror `deriveStateFromLegacy`) additionally take `plate_generation` and `plate_ready_generation`.

Rule: a scene may only reach `audio_prep`, `audio_ready`, `lipsync_dispatched`, `lipsync_running`, `lipsync_muxing` or `complete` when the plate of the **current** generation is proven ready — `plate_ready_generation = plate_generation` and a non-empty output URL. If it is not, stale `twoshot_stage` / `lip_sync_status` values are ignored for phase purposes and the state falls back to the plate phase derived from `clip_status` + `active_run_id` (`plate_queued` / `plate_rendering` / `idle`). `canceled` and `failed` keep their precedence; they are not phase-forward states.

The bridge trigger passes the two new columns through, so old-path legacy writes can no longer pull a fresh run forward.

### 2. Auto-trigger gets the same guard

`useTwoShotAutoTrigger` selects `plate_generation, plate_ready_generation, active_run_id` and applies one shared predicate — `isCurrentGenerationPlateReady(row)` — in the audio-prep filter, the lip-sync candidate filter and the self-heal branches. A `clip_url` alone no longer qualifies a scene; a URL from a previous generation is treated as absent. The same predicate is exported from `src/lib/composer/sceneState.ts` so client and hook cannot drift.

### 3. Failure substate reflects the real failing phase

`composer_substate_from_legacy` (and the TS mirror) only yields `lipsync_failed` when the current-generation plate was ready. A failure while the plate is not ready yields a plate-phase substate (`plate_failed`), which the UI labels as a clip/plate failure. Terminal states stop carrying progress-flavoured substates such as `anchor`.

### 4. Global progress honest about failures and run changes

- `legacyClipReadyEquivalentRow` keeps its ready/failed exclusivity, but `usePipelineProgress` counts a scene as a *ready clip* only when it is not in a failed state; failed-with-output counts as settled-failed, not as a successful clip phase.
- On a run/generation change, derived progress uses only artifacts of that run. 100 → 0 at run start is correct and stays; the fixed defect is the later jump back to a stale 65 %.

### 5. Copy pass (last, after the contract holds)

- `plate_rendering`: "Generating clip" / "Clip wird generiert" / "Generando clip".
- `audio_prep`: "Generating voiceover" / "Voiceover wird erzeugt" / "Generando voz en off".
- `scene.status.failed` ES: "Fallido".
- New `plate_failed` detail label in all three locales.

## Invariant tests (permanent regression guard)

New test file next to the existing composer state tests:

1. `current plate not ready ⇒ derived state ∉ {audio_prep, audio_ready, lipsync_dispatched, lipsync_running, lipsync_muxing, complete}` — table-driven over every legacy `twoshot_stage` / `lip_sync_status` combination.
2. `plate_ready_generation ≠ plate_generation ⇒ auto-trigger predicate is false`, even with a non-empty `clip_url`.
3. `substate 'lipsync_failed' requires a ready current-generation plate`.
4. TS ↔ SQL parity: the mirror in `src/lib/composer/sceneState.ts` and `supabase/functions/_shared/scene-state.ts` produce identical results for the full case matrix.
5. Progress: a failed-with-output scene does not increase the clips-ready count.

## Technical notes

- Files: `src/lib/composer/sceneState.ts`, `supabase/functions/_shared/scene-state.ts`, `src/hooks/useTwoShotAutoTrigger.ts`, `src/hooks/usePipelineProgress.ts`, `src/lib/composer/status/sceneStatusPresenter.ts`, `src/components/video-composer/SceneStatusBadge.tsx`.
- One migration: replaces `composer_state_from_legacy` (new signature with the two generation args), `composer_substate_from_legacy`, and `composer_scene_state_bridge` to pass `NEW.plate_generation` / `NEW.plate_ready_generation`. The old function signature is dropped only after the bridge is updated in the same migration.
- No backfill of historical rows; derivation is read-time, and existing `pipeline_state` values keep priority over the legacy mirror.
- No pipeline behaviour beyond phase gating changes — no new renders, no provider calls, no credit paths touched.

## Out of scope

- V435 Phase 1 reference run (resumes only after V438 passes).
- Lip-sync-only reset preserving `faceMap` (V436 follow-up, separate gate).
- `v434_artifact_pins` accumulation cleanup.
