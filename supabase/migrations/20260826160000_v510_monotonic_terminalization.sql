-- ═══════════════════════════════════════════════════════════════════════════
-- V510-P0 — MONOTONIC TERMINALIZATION + LOST-UPDATE FIX
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Production incident, scene 67b392b1, generation 10, run 58a103cc:
--
--   Passes 0/2/3 dispatched (HTTP 201) and wrote their job ids per slot.
--   Pass 4 then failed pre-dispatch and wrote its ~2500-line-old local
--   `passes[]` snapshot back as a whole-row update, erasing
--   passes[2].job_id (cf76aa2c) and passes[3].job_id (0fba3717).
--   Pass 1 — which had passed the early fanout fence long before — then
--   dispatched and reset the root to lip_sync_status='running',
--   twoshot_stage='syncso_pass_2_of_6', clip_error=null, resurrecting a run
--   that had already terminalized AND refunded.
--
-- Two existing primitives were close but insufficient:
--
--   update_dialog_pass_slot        gives per-slot isolation, no root/terminal
--   update_dialog_shots_root_merge gives root merge with `passes` stripped,
--                                  but is unconditional — it cannot refuse a
--                                  late "running" write.
--
-- Neither provides ATOMIC terminalization, and two sequential RPC calls are
-- not a transaction. Hence exactly two new functions, both taking the row
-- lock once and deciding inside it.
--
-- TERMINAL IS RUN-SCOPED. `dialog_shots.v510_terminal.run_id` records WHICH
-- run ended. A genuinely new run carries a new run id and is never blocked by
-- a previous run's terminal marker — that is what keeps a user-authorized
-- fresh attempt working without a separate unblock path.
--
-- TERMINAL DOES NOT MEAN "DISCARD ACCEPTED WORK". Per-slot writes stay
-- allowed after terminalization so a provider job accepted during the race
-- can still be recorded and later reconciled through the ledger.

-- ── 1. Atomic terminalization ──────────────────────────────────────────────
--
-- One transaction: patch ONLY the failing slot, merge the root, stamp the
-- terminal marker, set the scene columns. Sibling slots are never read into
-- the caller and therefore cannot be written back stale.
CREATE OR REPLACE FUNCTION public.composer_terminalize_dialog_run(
  _scene_id uuid,
  _run_id text,
  _pass_idx integer,
  _pass_patch jsonb,
  _root_patch jsonb,
  _scene_patch jsonb,
  _terminal_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  _ds jsonb;
  _arr jsonb;
  _slot jsonb;
  _existing jsonb;
  _first_terminal boolean;
  _marker jsonb;
BEGIN
  IF _pass_idx IS NOT NULL AND (_pass_patch IS NULL OR jsonb_typeof(_pass_patch) <> 'object') THEN
    RAISE EXCEPTION 'composer_terminalize_dialog_run: pass patch must be a jsonb object';
  END IF;
  IF _pass_idx IS NOT NULL AND _pass_idx < 0 THEN
    RAISE EXCEPTION 'composer_terminalize_dialog_run: negative pass index %', _pass_idx;
  END IF;

  SELECT COALESCE(dialog_shots, '{}'::jsonb) INTO _ds
  FROM public.composer_scenes WHERE id = _scene_id FOR UPDATE;
  IF _ds IS NULL THEN
    RAISE EXCEPTION 'composer_terminalize_dialog_run: scene_not_found %', _scene_id;
  END IF;

  _existing := _ds -> 'v510_terminal';
  -- Idempotent per run: the FIRST terminal reason of a run is the one that
  -- stands. A second failing sibling still records its own slot below.
  _first_terminal := NOT (
    jsonb_typeof(_existing) = 'object'
    AND COALESCE(_existing ->> 'run_id', '') = COALESCE(_run_id, '')
  );

  -- ── own slot only ────────────────────────────────────────────────────────
  -- A NULL pass index means the run died before any pass owned a slot (plate
  -- probe, audio preflight). Root + marker still apply; no slot is touched.
  IF _pass_idx IS NOT NULL THEN
  _arr := CASE WHEN jsonb_typeof(_ds->'passes') = 'array'
               THEN _ds->'passes' ELSE '[]'::jsonb END;
  WHILE jsonb_array_length(_arr) <= _pass_idx LOOP
    _arr := _arr || jsonb_build_array(jsonb_build_object(
      'idx', jsonb_array_length(_arr), 'status', 'pending', 'slot_padded', true
    ));
  END LOOP;
  _slot := COALESCE(_arr->_pass_idx, '{}'::jsonb);
  IF jsonb_typeof(_slot) <> 'object' THEN _slot := '{}'::jsonb; END IF;
  -- Never let a failure erase transport pointers this slot already holds.
  _slot := (_slot || _pass_patch || jsonb_build_object('idx', _pass_idx)) - 'slot_padded';
  _arr := jsonb_set(_arr, ARRAY[_pass_idx::text], _slot, true);
  _ds := jsonb_set(_ds, ARRAY['passes'], _arr, true);
  END IF;

  -- ── root merge — `passes` can never be supplied from outside ─────────────
  IF _root_patch IS NOT NULL AND jsonb_typeof(_root_patch) = 'object' THEN
    IF _first_terminal THEN
      _ds := _ds || (_root_patch - 'passes');
    ELSE
      -- A later sibling failure must not rewrite the first terminal reason,
      -- finished_at or refund bookkeeping.
      _ds := _ds || ((_root_patch - 'passes') - 'error' - 'finished_at' - 'refunded' - 'v459_refund');
    END IF;
  END IF;

  _marker := COALESCE(_existing, '{}'::jsonb) || jsonb_build_object(
    'run_id', _run_id,
    'reason', CASE WHEN _first_terminal THEN _terminal_reason
                   ELSE COALESCE(_existing ->> 'reason', _terminal_reason) END,
    'pass_idx', CASE WHEN _first_terminal THEN _pass_idx
                     ELSE COALESCE((_existing ->> 'pass_idx')::int, _pass_idx) END,
    'at', CASE WHEN _first_terminal THEN to_jsonb(now())
               ELSE COALESCE(_existing -> 'at', to_jsonb(now())) END
  );
  _ds := jsonb_set(_ds, ARRAY['v510_terminal'], _marker, true);

  -- `? 'key'` rather than COALESCE for the nullable columns: a terminal write
  -- must be able to CLEAR clip_url / lip_sync_source_clip_url (the v153
  -- needs_clip_rerender path does exactly that), which COALESCE cannot express.
  UPDATE public.composer_scenes
  SET dialog_shots = _ds,
      lip_sync_status = COALESCE(_scene_patch ->> 'lip_sync_status', lip_sync_status),
      twoshot_stage   = COALESCE(_scene_patch ->> 'twoshot_stage', twoshot_stage),
      clip_error      = COALESCE(_scene_patch ->> 'clip_error', clip_error),
      clip_status     = COALESCE(_scene_patch ->> 'clip_status', clip_status),
      clip_url        = CASE WHEN _scene_patch ? 'clip_url'
                             THEN _scene_patch ->> 'clip_url' ELSE clip_url END,
      lip_sync_source_clip_url = CASE WHEN _scene_patch ? 'lip_sync_source_clip_url'
                             THEN _scene_patch ->> 'lip_sync_source_clip_url'
                             ELSE lip_sync_source_clip_url END,
      updated_at = now()
  WHERE id = _scene_id;

  RETURN jsonb_build_object(
    'terminal', _marker,
    'first_terminal', _first_terminal,
    'dialog_shots', _ds
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.composer_terminalize_dialog_run(uuid, text, integer, jsonb, jsonb, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.composer_terminalize_dialog_run(uuid, text, integer, jsonb, jsonb, jsonb, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.composer_terminalize_dialog_run(uuid, text, integer, jsonb, jsonb, jsonb, text) TO service_role;

-- ── 2. Monotonic progress write ────────────────────────────────────────────
--
-- The success path used to reset the root to `running` unconditionally, on
-- the documented assumption that "latest writer's value is fine". That holds
-- among running siblings; it does not hold once one of them has terminalized.
-- The decision is made INSIDE the row lock — a caller-side SELECT followed by
-- UPDATE would reintroduce the same race it is meant to close.
--
-- Returns `applied` so the caller can log the block. Blocking is NOT an
-- error: the pass's own slot write is a separate, always-allowed call.
CREATE OR REPLACE FUNCTION public.composer_touch_dialog_run_progress(
  _scene_id uuid,
  _run_id text,
  _root_patch jsonb,
  _scene_patch jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  _ds jsonb;
  _terminal jsonb;
  _blocked boolean;
BEGIN
  SELECT COALESCE(dialog_shots, '{}'::jsonb) INTO _ds
  FROM public.composer_scenes WHERE id = _scene_id FOR UPDATE;
  IF _ds IS NULL THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'scene_not_found');
  END IF;

  _terminal := _ds -> 'v510_terminal';
  -- Run-scoped: only THIS run's terminal marker blocks THIS run's progress.
  -- A new run carries a new id and proceeds normally.
  _blocked := jsonb_typeof(_terminal) = 'object'
    AND COALESCE(_terminal ->> 'run_id', '') = COALESCE(_run_id, '')
    AND COALESCE(_run_id, '') <> '';

  IF _blocked THEN
    RETURN jsonb_build_object(
      'applied', false,
      'reason', 'run_terminal',
      'terminal', _terminal
    );
  END IF;

  IF _root_patch IS NOT NULL AND jsonb_typeof(_root_patch) = 'object' THEN
    _ds := _ds || (_root_patch - 'passes' - 'v510_terminal');
  END IF;

  UPDATE public.composer_scenes
  SET dialog_shots = _ds,
      lip_sync_status = COALESCE(_scene_patch ->> 'lip_sync_status', lip_sync_status),
      twoshot_stage   = COALESCE(_scene_patch ->> 'twoshot_stage', twoshot_stage),
      clip_error      = CASE WHEN _scene_patch ? 'clip_error'
                             THEN _scene_patch ->> 'clip_error' ELSE clip_error END,
      lip_sync_source_clip_url = COALESCE(_scene_patch ->> 'lip_sync_source_clip_url', lip_sync_source_clip_url),
      replicate_prediction_id  = COALESCE(_scene_patch ->> 'replicate_prediction_id', replicate_prediction_id),
      updated_at = now()
  WHERE id = _scene_id;

  RETURN jsonb_build_object('applied', true, 'reason', 'ok');
END;
$fn$;

REVOKE ALL ON FUNCTION public.composer_touch_dialog_run_progress(uuid, text, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.composer_touch_dialog_run_progress(uuid, text, jsonb, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.composer_touch_dialog_run_progress(uuid, text, jsonb, jsonb) TO service_role;

-- ── 3. Terminal reconciliation ─────────────────────────────────────────────
--
-- V510 makes the root monotonic. That alone would strand accepted work:
-- sync-so-webhook returns `ignored_due_scene_failed` for a failed scene
-- BEFORE it ever reaches composer_apply_sync_segment_result, so a provider
-- job that was accepted (HTTP 201) before a sibling terminalized would never
-- settle its slot or its ledger row.
--
-- The guard itself is correct and stays: a late result must not flip a failed
-- scene to done, replay refunds, or advance the fan-out. What was missing is
-- a path that reconciles the ACCEPTED WORK without re-entering any of that.
--
-- Hence this function, and not a relaxation of composer_apply_sync_segment_-
-- result_core: that core owns aggregation, NOOP escalation, mux dispatch and
-- retry semantics, none of which may run after terminalization. Splitting the
-- contract is what keeps "record the outcome" separate from "decide what
-- happens next".
--
-- ROOT MONOTONICITY IS STRUCTURAL, NOT DEFENSIVE: this function contains no
-- `UPDATE public.composer_scenes` statement. Its only scene mutation is
-- `update_dialog_pass_slot`, which writes `dialog_shots.passes[i]` and
-- nothing else. dialog_shots.status / error / finished_at / v510_terminal /
-- refunded and lip_sync_status / twoshot_stage / clip_error are therefore
-- unreachable from here — not merely left alone.
--
-- Provenance is the ledger, exactly as in the normal apply: pipeline job row
-- → stage → external_job_id → run_id → plate_generation → metadata.pass_idx
-- → slot pointer pair. Nothing resolves by position or by name.
CREATE OR REPLACE FUNCTION public.composer_reconcile_terminal_sync_result(
  _pipeline_job_id uuid,
  _external_job_id text,
  _provider_status text,
  _output_url text,
  _error_text text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  _job public.composer_pipeline_jobs%ROWTYPE;
  _scene public.composer_scenes%ROWTYPE;
  _ds jsonb;
  _arr jsonb;
  _slot jsonb;
  _terminal jsonb;
  _pass_idx integer;
  _patch jsonb;
  _segment_result text;
  _err text;
  _write_id constant text := 'ssw:terminal_reconcile';
  _state public.composer_scene_state;
  _audit jsonb;
  _success boolean;
BEGIN
  _err := left(COALESCE(NULLIF(btrim(_error_text), ''), ''), 500);
  _success := (_provider_status = 'COMPLETED');

  -- Closed status/output matrix, same shape as the normal apply.
  IF _success THEN
    IF COALESCE(btrim(_output_url), '') = '' THEN
      RETURN jsonb_build_object('applied', false, 'verdict', 'rejected', 'reason', 'write_id_mismatch');
    END IF;
  ELSIF _provider_status IS NULL OR _provider_status NOT IN ('FAILED', 'REJECTED', 'CANCELED') THEN
    RETURN jsonb_build_object('applied', false, 'verdict', 'rejected', 'reason', 'write_id_not_allowed');
  END IF;

  IF _pipeline_job_id IS NULL THEN
    RETURN jsonb_build_object('applied', false, 'verdict', 'rejected', 'reason', 'missing_binding');
  END IF;

  -- Lock order: pipeline job → scene. Identical to
  -- composer_apply_sync_segment_result, so the two can never deadlock.
  SELECT * INTO _job FROM public.composer_pipeline_jobs
  WHERE id = _pipeline_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('applied', false, 'verdict', 'rejected', 'reason', 'job_not_found');
  END IF;

  SELECT * INTO _scene FROM public.composer_scenes WHERE id = _job.scene_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('applied', false, 'verdict', 'rejected', 'reason', 'scene_not_found');
  END IF;

  _state := _scene.pipeline_state;
  _audit := jsonb_build_object(
    'pipeline_job_id', _job.id,
    'external_job_id', _external_job_id,
    'stage', _job.stage,
    'job_status', _job.status,
    'terminal_reconcile', true
  );

  IF _job.stage IS DISTINCT FROM 'sync_segment' THEN
    PERFORM public.composer_log_sync_segment_audit(_scene.id, _scene.project_id, _state, _state,
      _job.run_id, _job.plate_generation, _write_id, false, 'wrong_stage', _audit);
    RETURN jsonb_build_object('applied', false, 'verdict', 'rejected', 'reason', 'wrong_stage');
  END IF;
  IF _job.external_job_id IS NULL THEN
    PERFORM public.composer_log_sync_segment_audit(_scene.id, _scene.project_id, _state, _state,
      _job.run_id, _job.plate_generation, _write_id, false, 'binding_pending', _audit);
    RETURN jsonb_build_object('applied', false, 'verdict', 'rejected', 'reason', 'binding_pending');
  END IF;
  IF _job.external_job_id IS DISTINCT FROM _external_job_id THEN
    PERFORM public.composer_log_sync_segment_audit(_scene.id, _scene.project_id, _state, _state,
      _job.run_id, _job.plate_generation, _write_id, false, 'wrong_job', _audit);
    RETURN jsonb_build_object('applied', false, 'verdict', 'rejected', 'reason', 'wrong_job');
  END IF;
  IF _job.run_id IS DISTINCT FROM _scene.active_run_id THEN
    PERFORM public.composer_log_sync_segment_audit(_scene.id, _scene.project_id, _state, _state,
      _job.run_id, _job.plate_generation, _write_id, false, 'stale_run', _audit);
    RETURN jsonb_build_object('applied', false, 'verdict', 'rejected', 'reason', 'stale_run');
  END IF;
  IF _job.plate_generation IS DISTINCT FROM _scene.plate_generation THEN
    PERFORM public.composer_log_sync_segment_audit(_scene.id, _scene.project_id, _state, _state,
      _job.run_id, _job.plate_generation, _write_id, false, 'stale_generation', _audit);
    RETURN jsonb_build_object('applied', false, 'verdict', 'rejected', 'reason', 'stale_generation');
  END IF;
  IF _job.metadata IS NULL OR (_job.metadata->>'pass_idx') IS NULL THEN
    PERFORM public.composer_log_sync_segment_audit(_scene.id, _scene.project_id, _state, _state,
      _job.run_id, _job.plate_generation, _write_id, false, 'pass_identity_missing', _audit);
    RETURN jsonb_build_object('applied', false, 'verdict', 'rejected', 'reason', 'pass_identity_missing');
  END IF;
  _pass_idx := (_job.metadata->>'pass_idx')::integer;
  _audit := _audit || jsonb_build_object('pass_idx', _pass_idx);

  _ds := COALESCE(_scene.dialog_shots, '{}'::jsonb);
  _arr := CASE WHEN jsonb_typeof(_ds->'passes') = 'array' THEN _ds->'passes' ELSE '[]'::jsonb END;
  IF jsonb_array_length(_arr) <= _pass_idx THEN
    PERFORM public.composer_log_sync_segment_audit(_scene.id, _scene.project_id, _state, _state,
      _job.run_id, _job.plate_generation, _write_id, false, 'wrong_pass', _audit);
    RETURN jsonb_build_object('applied', false, 'verdict', 'rejected', 'reason', 'wrong_pass');
  END IF;
  _slot := COALESCE(_arr->_pass_idx, '{}'::jsonb);

  -- ── The distinction this whole function exists for ───────────────────────
  -- Terminal reconciliation applies ONLY to a run this codebase terminalized,
  -- in THIS generation. A historical failed scene has no marker and must keep
  -- its legacy ignore; a marker from an earlier run must never reach into the
  -- current one. Both are refused here, in the database, not only at the edge.
  _terminal := _ds -> 'v510_terminal';
  IF jsonb_typeof(_terminal) <> 'object'
     OR COALESCE(_terminal ->> 'run_id', '') = ''
     OR _terminal ->> 'run_id' IS DISTINCT FROM _job.run_id::text
     OR _terminal ->> 'run_id' IS DISTINCT FROM _scene.active_run_id::text THEN
    PERFORM public.composer_log_sync_segment_audit(_scene.id, _scene.project_id, _state, _state,
      _job.run_id, _job.plate_generation, _write_id, false, 'not_v510_terminal', _audit);
    RETURN jsonb_build_object('applied', false, 'verdict', 'rejected', 'reason', 'not_v510_terminal');
  END IF;

  -- Slot pointer pair — identity came from the ledger and must agree with the
  -- slot it claims. Position and speaker name are never consulted.
  IF (_slot->>'pipeline_job_id') IS DISTINCT FROM _pipeline_job_id::text
     OR (_slot->>'job_id') IS DISTINCT FROM _external_job_id THEN
    PERFORM public.composer_log_sync_segment_audit(_scene.id, _scene.project_id, _state, _state,
      _job.run_id, _job.plate_generation, _write_id, false, 'wrong_pass', _audit);
    RETURN jsonb_build_object('applied', false, 'verdict', 'rejected',
      'reason', 'wrong_pass', 'pass_idx', _pass_idx);
  END IF;

  -- Duplicate matrix. A ledger row that is already terminal is never rewritten
  -- — and never escalated into a redrive, because there is nothing left to
  -- drive: the run has ended.
  IF _job.status IN ('succeeded', 'failed', 'stale', 'cancelled') OR _job.replaced_by IS NOT NULL THEN
    IF _job.status = 'succeeded' AND _success
       AND (_slot->>'output_url') IS NOT DISTINCT FROM _output_url THEN
      PERFORM public.composer_log_sync_segment_audit(_scene.id, _scene.project_id, _state, _state,
        _job.run_id, _job.plate_generation, _write_id, false, 'duplicate_callback',
        _audit || jsonb_build_object('verdict', 'noop'));
      RETURN jsonb_build_object('applied', false, 'verdict', 'noop',
        'reason', 'duplicate_callback', 'pass_idx', _pass_idx);
    END IF;
    PERFORM public.composer_log_sync_segment_audit(_scene.id, _scene.project_id, _state, _state,
      _job.run_id, _job.plate_generation, _write_id, false, 'conflicting_duplicate', _audit);
    RETURN jsonb_build_object('applied', false, 'verdict', 'rejected',
      'reason', 'conflicting_duplicate', 'pass_idx', _pass_idx);
  END IF;

  -- ── Own slot only ────────────────────────────────────────────────────────
  IF _success THEN
    _patch := jsonb_build_object(
      'status', 'done',
      'output_url', _output_url,
      'finished_at', now(),
      'v510_terminal_reconciled', true
    );
    _segment_result := 'succeeded';
  ELSE
    _patch := jsonb_build_object(
      'status', 'failed',
      'finished_at', now(),
      'last_error', left(_err, 300),
      'last_error_class', 'provider_' || lower(_provider_status),
      'v510_terminal_reconciled', true
    );
    _segment_result := 'failed';
  END IF;

  -- The one and only scene mutation, and it can reach nothing but this slot.
  PERFORM public.update_dialog_pass_slot(_scene.id, _pass_idx, _patch);

  -- ── Ledger terminalization ───────────────────────────────────────────────
  UPDATE public.composer_pipeline_jobs
  SET status = CASE WHEN _success THEN 'succeeded' ELSE 'failed' END,
      error_code = CASE WHEN _success THEN NULL
                        ELSE 'provider_' || lower(_provider_status) END,
      completed_at = now(),
      callback_delivery_status = 'succeeded',
      updated_at = now()
  WHERE id = _job.id;

  PERFORM public.composer_log_sync_segment_audit(_scene.id, _scene.project_id, _state, _state,
    _job.run_id, _job.plate_generation, _write_id, true, 'terminal_reconciled',
    _audit || jsonb_build_object('verdict', 'terminal_reconciled', 'segment_result', _segment_result));

  RETURN jsonb_build_object(
    'applied', true,
    'verdict', 'terminal_reconciled',
    'segment_result', _segment_result,
    'pass_idx', _pass_idx,
    'run_id', _job.run_id,
    'terminal', _terminal
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.composer_reconcile_terminal_sync_result(uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.composer_reconcile_terminal_sync_result(uuid, text, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.composer_reconcile_terminal_sync_result(uuid, text, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.composer_reconcile_terminal_sync_result(uuid, text, text, text, text) TO service_role;

-- ── 4. Atomic callback pre-bind adoption ───────────────────────────────────
--
-- The dispatcher's order after HTTP 201 is:
--
--   fetch → 201 → registerInflightSyncJob → recordCircuitSuccess
--        → composer_bind_sync_pass_attempt   ← the binding appears HERE
--        → update_dialog_pass_slot → progress touch
--
-- A terminal webhook can arrive before that bind. The ledger row then exists
-- with `external_job_id IS NULL`, and `dialog_shots.passes[i].job_id` is still
-- empty, so nothing in the compatibility mirror can match the callback.
--
-- Waiting for a redelivery is NOT an option, and this is the correction that
-- forced this function into existence: lipsync-watchdog documents in its own
-- header that "Sync.so does NOT retry missed webhook deliveries", and its scan
-- filter is lip_sync_status IN (running, audio_muxing) plus specific `pending`
-- shapes — `failed` appears in no branch. A V510-terminalized scene is thus
-- outside the poller entirely. A dropped fast callback on such a scene is
-- dropped forever: the slot never settles, the ledger row never closes, and
-- the paid-for output is never pointed at.
--
-- But the webhook already holds everything needed to finish the binding
-- itself: the pipeline_job_id from its own URL, the external job id from the
-- payload, and — once the ledger row is locked — the authoritative pass_idx
-- from `metadata`. So it adopts the binding rather than waiting for one.
--
-- THIS IS NOT POSITIONAL INFERENCE. The pass index is read out of the locked
-- ledger row, never guessed from the external id or from array position. The
-- scene epoch (run_id, plate_generation) is verified against the scene row
-- inside the SAME transaction, so a callback from a previous run or generation
-- can never write a pointer into the current one.
--
-- Idempotency with the dispatcher is by construction: this writes exactly the
-- three fields `composer_bind_sync_pass_attempt` checks for its own `noop`
-- short-circuit — job.external_job_id, slot.job_id, slot.pipeline_job_id — so
-- the dispatcher's later bind of the same attempt returns 'noop' rather than
-- raising or overwriting.
CREATE OR REPLACE FUNCTION public.composer_adopt_sync_callback_binding(
  _pipeline_job_id uuid,
  _external_job_id text,
  _scene_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  _job public.composer_pipeline_jobs%ROWTYPE;
  _scene public.composer_scenes%ROWTYPE;
  _ds jsonb;
  _arr jsonb;
  _slot jsonb;
  _pass_idx integer;
  _slot_job text;
  _slot_ptr text;
BEGIN
  IF _pipeline_job_id IS NULL OR COALESCE(btrim(_external_job_id), '') = '' THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'missing_binding');
  END IF;

  -- Lock order: pipeline job → scene. Identical to
  -- composer_apply_sync_segment_result and to
  -- composer_reconcile_terminal_sync_result, so none of the three can deadlock
  -- against another.
  SELECT * INTO _job FROM public.composer_pipeline_jobs
  WHERE id = _pipeline_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'job_not_found');
  END IF;

  IF _job.stage IS DISTINCT FROM 'sync_segment' THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'wrong_stage');
  END IF;
  IF _scene_id IS NOT NULL AND _job.scene_id IS DISTINCT FROM _scene_id THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'wrong_scene');
  END IF;

  SELECT * INTO _scene FROM public.composer_scenes WHERE id = _job.scene_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'scene_not_found');
  END IF;

  -- ── Scene epoch, verified under the scene lock ───────────────────────────
  -- The whole point of doing this here rather than in the caller: between a
  -- caller-side SELECT and a caller-side write, a reset can move the scene to
  -- a new run. Then an old-run callback would bind its pointer into the new
  -- run's slot. Inside this lock that is impossible.
  IF _job.run_id IS DISTINCT FROM _scene.active_run_id THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'stale_run');
  END IF;
  IF _job.plate_generation IS DISTINCT FROM _scene.plate_generation THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'stale_generation');
  END IF;

  IF _job.metadata IS NULL OR (_job.metadata->>'pass_idx') IS NULL THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'pass_identity_missing');
  END IF;
  _pass_idx := (_job.metadata->>'pass_idx')::integer;

  _ds := COALESCE(_scene.dialog_shots, '{}'::jsonb);
  _arr := CASE WHEN jsonb_typeof(_ds->'passes') = 'array' THEN _ds->'passes' ELSE '[]'::jsonb END;
  IF jsonb_array_length(_arr) <= _pass_idx THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'pass_slot_missing',
                              'pass_idx', _pass_idx);
  END IF;
  _slot := COALESCE(_arr->_pass_idx, '{}'::jsonb);
  IF jsonb_typeof(_slot) <> 'object' THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'pass_slot_invalid',
                              'pass_idx', _pass_idx);
  END IF;

  -- Slot-side provenance, where the slot carries it. Mirrors
  -- composer_bind_sync_pass_attempt so the two agree on what a legal bind is.
  IF (_slot->>'run_id') IS NOT NULL AND _job.run_id IS NOT NULL
     AND (_slot->>'run_id') IS DISTINCT FROM _job.run_id::text THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'slot_run_mismatch',
                              'pass_idx', _pass_idx);
  END IF;
  IF (_slot->>'plate_generation') IS NOT NULL AND _job.plate_generation IS NOT NULL
     AND (_slot->>'plate_generation')::integer IS DISTINCT FROM _job.plate_generation THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'slot_generation_mismatch',
                              'pass_idx', _pass_idx);
  END IF;

  _slot_job := _slot->>'job_id';
  _slot_ptr := _slot->>'pipeline_job_id';

  -- ── Already bound to this exact attempt ──────────────────────────────────
  IF _job.external_job_id IS NOT DISTINCT FROM _external_job_id
     AND _slot_job IS NOT DISTINCT FROM _external_job_id
     AND _slot_ptr IS NOT DISTINCT FROM _pipeline_job_id::text THEN
    RETURN jsonb_build_object('outcome', 'already_bound', 'pass_idx', _pass_idx);
  END IF;

  -- ── Conflict: an attempt is bound once and never rebound ─────────────────
  IF _job.external_job_id IS NOT NULL
     AND _job.external_job_id IS DISTINCT FROM _external_job_id THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'external_job_conflict',
                              'pass_idx', _pass_idx, 'bound_to', _job.external_job_id);
  END IF;
  IF _slot_job IS NOT NULL AND _slot_job IS DISTINCT FROM _external_job_id THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'slot_job_conflict',
                              'pass_idx', _pass_idx, 'bound_to', _slot_job);
  END IF;
  IF _slot_ptr IS NOT NULL AND _slot_ptr IS DISTINCT FROM _pipeline_job_id::text THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'slot_pointer_conflict',
                              'pass_idx', _pass_idx, 'bound_to', _slot_ptr);
  END IF;

  -- ── Adopt ────────────────────────────────────────────────────────────────
  UPDATE public.composer_pipeline_jobs
  SET external_job_id = _external_job_id,
      status = CASE WHEN status IN ('pending', 'dispatching') THEN 'dispatched' ELSE status END,
      updated_at = now()
  WHERE id = _pipeline_job_id;

  -- Only the two transport pointers, merged into the slot. Every other field
  -- the dispatcher put there survives untouched, and no sibling is written.
  _slot := (_slot || jsonb_build_object(
    'idx', _pass_idx,
    'job_id', _external_job_id,
    'pipeline_job_id', _pipeline_job_id::text,
    'v510_callback_adopted', true
  )) - 'slot_padded';
  _arr := jsonb_set(_arr, ARRAY[_pass_idx::text], _slot, true);
  _ds := jsonb_set(_ds, ARRAY['passes'], _arr, true);

  UPDATE public.composer_scenes
  SET dialog_shots = _ds, updated_at = now()
  WHERE id = _scene.id;

  RETURN jsonb_build_object('outcome', 'bound', 'pass_idx', _pass_idx);
END;
$fn$;

REVOKE ALL ON FUNCTION public.composer_adopt_sync_callback_binding(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.composer_adopt_sync_callback_binding(uuid, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.composer_adopt_sync_callback_binding(uuid, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.composer_adopt_sync_callback_binding(uuid, text, uuid) TO service_role;
