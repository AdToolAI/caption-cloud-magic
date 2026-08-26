-- ═══════════════════════════════════════════════════════════════════════════
-- V511 — CONDITIONAL WATCHDOG PASS RESET
-- ═══════════════════════════════════════════════════════════════════════════
--
-- lipsync-watchdog's auto-retry decided which passes were stuck from a
-- snapshot taken at the top of its tick, then persisted a whole
-- `dialog_shots` object rebuilt from that snapshot:
--
--     dialog_shots: { ...(ds || {}), passes: newPasses, ... }
--
-- V511's own lock split made that strictly more dangerous: the lease is now
-- genuinely released for the provider GET and the webhook forward, so
-- sync-so-webhook can commit Kay's completion in between — and this write
-- would then erase it from a snapshot that never saw it. The generation-10
-- lost update, relocated into the watchdog.
--
-- A fresh SELECT before the UPDATE does not fix it. That is still
-- check-then-act: the webhook can commit inside the window between the read
-- and the write. The reset has to be conditional AT THE ROW, under the lock,
-- against the exact attempt the watchdog decided about.
--
-- ── WHY NOT update_dialog_pass_slot ────────────────────────────────────────
-- It is per-slot and fenced, and it does refuse to demote a terminal slot —
-- but only for four keys:
--
--     IF _old_status IN ('done','failed','completed','cancelled')
--        AND _new_status IN ('pending',...)
--     THEN _patch := _patch - 'status' - 'output_url' - 'finished_at' - 'error';
--
-- `job_id` is not in that list, and the pairing rule immediately below it
-- turns a `job_id: null` patch into a null for `pipeline_job_id` as well. The
-- watchdog's retry patch carries exactly that. Applied to a slot the webhook
-- has just marked `done`, it would strip both transport pointers off a
-- completed pass and leave it unreconcilable — the precise failure V511 set
-- out to end. Hence a dedicated primitive rather than a reused one.

CREATE OR REPLACE FUNCTION public.composer_reset_sync_pass_for_watchdog_retry(
  _scene_id uuid,
  _run_id uuid,
  _plate_generation integer,
  _pass_idx integer,
  _expected_external_job_id text,
  _expected_pipeline_job_id text,
  _pass_patch jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  _scene public.composer_scenes%ROWTYPE;
  _ds jsonb;
  _arr jsonb;
  _slot jsonb;
  _status text;
BEGIN
  IF _pass_idx IS NULL OR _pass_idx < 0 THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'invalid_pass_idx');
  END IF;
  IF _pass_patch IS NULL OR jsonb_typeof(_pass_patch) <> 'object' THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'invalid_patch');
  END IF;

  SELECT * INTO _scene FROM public.composer_scenes WHERE id = _scene_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'scene_not_found');
  END IF;

  -- ── Epoch ────────────────────────────────────────────────────────────────
  -- The watchdog decided about ONE run and ONE plate generation. A reset that
  -- lands after a reset/regeneration would reach into a run it never examined.
  IF _run_id IS NOT NULL AND _scene.active_run_id IS DISTINCT FROM _run_id THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'stale_run',
                              'scene_run_id', _scene.active_run_id);
  END IF;
  IF _plate_generation IS NOT NULL
     AND _scene.plate_generation IS DISTINCT FROM _plate_generation THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'stale_generation',
                              'scene_plate_generation', _scene.plate_generation);
  END IF;

  -- ── V510 monotonicity ────────────────────────────────────────────────────
  -- A run that has terminalized is not retryable. Run-scoped, so a genuinely
  -- new run is never fenced by a previous run's marker.
  _ds := COALESCE(_scene.dialog_shots, '{}'::jsonb);
  IF jsonb_typeof(_ds -> 'v510_terminal') = 'object'
     AND COALESCE(_ds -> 'v510_terminal' ->> 'run_id', '') <> ''
     AND _ds -> 'v510_terminal' ->> 'run_id' IS NOT DISTINCT FROM _scene.active_run_id::text THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'run_terminal');
  END IF;

  _arr := CASE WHEN jsonb_typeof(_ds->'passes') = 'array' THEN _ds->'passes' ELSE '[]'::jsonb END;
  IF jsonb_array_length(_arr) <= _pass_idx THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'pass_slot_missing');
  END IF;
  _slot := COALESCE(_arr->_pass_idx, '{}'::jsonb);
  IF jsonb_typeof(_slot) <> 'object' THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'pass_slot_invalid');
  END IF;

  -- ── The attempt the watchdog actually decided about ──────────────────────
  -- Both halves of the transport pair, exactly. If the webhook re-bound this
  -- slot to a different attempt while the lock was released, this is not the
  -- pass the decision was made about and the decision does not apply to it.
  IF (_slot->>'job_id') IS DISTINCT FROM _expected_external_job_id THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'job_id_mismatch',
                              'current_job_id', _slot->>'job_id');
  END IF;
  IF (_slot->>'pipeline_job_id') IS DISTINCT FROM _expected_pipeline_job_id THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'pipeline_job_id_mismatch',
                              'current_pipeline_job_id', _slot->>'pipeline_job_id');
  END IF;

  -- ── Still retryable ──────────────────────────────────────────────────────
  -- This is the check that makes the generation-12 race safe: if the webhook
  -- completed Kay while the watchdog was unlocked, the slot is `done` and its
  -- pointers and output survive untouched.
  _status := COALESCE(_slot->>'status', '');
  IF _status <> 'rendering' THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'not_retryable',
                              'current_status', _status);
  END IF;
  IF COALESCE(_slot->>'output_url', '') <> '' THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'already_has_output');
  END IF;

  -- ── Patch THIS slot only ─────────────────────────────────────────────────
  -- Run provenance is immutable, as everywhere else; `idx` is authoritative
  -- from the argument, never from the patch.
  _slot := (_slot || (_pass_patch - 'run_id' - 'plate_generation' - 'idx'))
           || jsonb_build_object('idx', _pass_idx);
  _slot := _slot - 'slot_padded';
  _arr := jsonb_set(_arr, ARRAY[_pass_idx::text], _slot, true);
  _ds := jsonb_set(_ds, ARRAY['passes'], _arr, true);

  UPDATE public.composer_scenes
  SET dialog_shots = _ds, updated_at = now()
  WHERE id = _scene_id;

  RETURN jsonb_build_object('applied', true, 'reason', 'reset', 'pass_idx', _pass_idx);
END;
$fn$;

REVOKE ALL ON FUNCTION public.composer_reset_sync_pass_for_watchdog_retry(
  uuid, uuid, integer, integer, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.composer_reset_sync_pass_for_watchdog_retry(
  uuid, uuid, integer, integer, text, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.composer_reset_sync_pass_for_watchdog_retry(
  uuid, uuid, integer, integer, text, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.composer_reset_sync_pass_for_watchdog_retry(
  uuid, uuid, integer, integer, text, text, jsonb) TO service_role;