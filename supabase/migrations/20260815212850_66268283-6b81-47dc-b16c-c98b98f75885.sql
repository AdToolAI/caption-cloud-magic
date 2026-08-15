-- ============================================================================
-- v431 RS3 — Option A: Atomic Lip-Sync Reset Cancellation
-- Vertrag: .lovable/plan/v431-rs3-option-a-atomic-lip-sync-reset-cancellation
-- ============================================================================

-- §4 — Reset-cancellable Statusmenge (eine einzige SQL-Konstante)
CREATE OR REPLACE FUNCTION public.composer_rs3_reset_cancellable_statuses()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT ARRAY[
    'pending', 'dispatching', 'dispatched', 'running',
    'callback_processing', 'dispatch_uncertain'
  ]::text[];
$function$;

REVOKE ALL ON FUNCTION public.composer_rs3_reset_cancellable_statuses() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.composer_rs3_reset_cancellable_statuses() TO service_role;

-- ============================================================================
-- §2 — Ein DB-Primitive, ein Commit
-- Lock-Ordnung: advisory(scene) -> jobs FOR UPDATE (nach id) -> scene FOR UPDATE
-- ============================================================================
CREATE OR REPLACE FUNCTION public.composer_reset_lipsync_with_attempt_cancellation(
  _scene_id uuid,
  _expected_run_id uuid,
  _expected_plate_generation integer,
  _force boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _scene public.composer_scenes%ROWTYPE;
  _job public.composer_pipeline_jobs%ROWTYPE;
  _reset_id uuid := gen_random_uuid();
  _now timestamptz := now();
  _canceled uuid[] := ARRAY[]::uuid[];
  _external text[] := ARRAY[]::text[];
  _segments text[] := ARRAY['-']::text[];
  _plan jsonb;
  _twoshot jsonb;
  _marker jsonb;
  _restored text;
  _cost numeric := 0;
  _refund_claimed boolean := false;
  _ds jsonb;
BEGIN
  IF _scene_id IS NULL THEN
    RAISE EXCEPTION 'rs3_reset: scene_id is mandatory' USING ERRCODE = 'check_violation';
  END IF;

  -- 0. gemeinsamer Serialisierungspunkt (§5b)
  PERFORM pg_advisory_xact_lock(hashtextextended(_scene_id::text, 0));

  -- 1. Kandidaten-Jobs FOR UPDATE, deterministisch nach id
  FOR _job IN
    SELECT j.* FROM public.composer_pipeline_jobs j
    WHERE j.scene_id = _scene_id
      AND j.stage IN ('sync_segment', 'audio_mux')
      AND (_expected_run_id IS NULL OR j.run_id = _expected_run_id)
    ORDER BY j.id
    FOR UPDATE
  LOOP
    IF _job.status = ANY (public.composer_rs3_reset_cancellable_statuses())
       AND _job.replaced_by IS NULL THEN
      _canceled := _canceled || _job.id;
      IF _job.external_job_id IS NOT NULL THEN
        _external := _external || _job.external_job_id;
      END IF;
    END IF;
    IF _job.segment_id IS NOT NULL
       AND NOT (_job.segment_id::text = ANY (_segments)) THEN
      _segments := _segments || _job.segment_id::text;
    END IF;
  END LOOP;

  -- 2. Scene FOR UPDATE
  SELECT * INTO _scene FROM public.composer_scenes WHERE id = _scene_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'scene_not_found');
  END IF;

  -- 3. Run-/Generation-Guard
  IF (_expected_run_id IS NOT NULL AND _scene.active_run_id IS DISTINCT FROM _expected_run_id)
     OR (_expected_plate_generation IS NOT NULL
         AND _scene.plate_generation IS DISTINCT FROM _expected_plate_generation) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'outcome', 'stale_reset',
      'scene_run_id', _scene.active_run_id,
      'scene_plate_generation', _scene.plate_generation
    );
  END IF;

  IF _scene.lip_sync_applied_at IS NOT NULL AND COALESCE(_force, false) = false THEN
    RETURN jsonb_build_object('ok', true, 'outcome', 'already_applied');
  END IF;

  -- 4. Aktive Lip-Sync-Attempts terminalisieren; terminale bleiben unberuehrt
  IF array_length(_canceled, 1) IS NOT NULL THEN
    UPDATE public.composer_pipeline_jobs
    SET status = 'cancelled',
        error_code = 'user_reset',
        completed_at = _now,
        callback_claim_token = NULL,
        callback_claimed_at = NULL,
        callback_claim_expires_at = NULL
    WHERE id = ANY (_canceled);
  END IF;

  -- 5./6. Reset-Semantik (Feldsatz exakt wie bisher in reset-lipsync-scene)
  _ds := COALESCE(_scene.dialog_shots, '{}'::jsonb);
  _cost := COALESCE(NULLIF(_ds->>'cost_credits', '')::numeric, 0);
  IF _cost > 0 AND COALESCE((_ds->>'refunded')::boolean, false) = false THEN
    _refund_claimed := true;
  END IF;

  _plan := COALESCE(_scene.audio_plan, '{}'::jsonb);
  _twoshot := COALESCE(_plan->'twoshot', '{}'::jsonb);
  _twoshot := _twoshot
    - 'faceMap' - 'anchor_face_audit' - 'sync_job_id'
    - 'segments_payload' - 'last_segments' - 'audio_input_mode'
    - 'syncJobs';

  -- 7. Reset-Marker zuletzt (§3)
  _marker := jsonb_build_object(
    'reset_id', _reset_id::text,
    'run_id', _scene.active_run_id,
    'plate_generation', _scene.plate_generation,
    'reset_at', to_jsonb(_now),
    'sync_segments', to_jsonb(_segments),
    'mux_rearm_allowed', true,
    'refund_claimed', _refund_claimed
  );
  _twoshot := _twoshot || jsonb_build_object('rs3_reset', _marker);
  _plan := _plan || jsonb_build_object('twoshot', _twoshot);

  _restored := CASE
    WHEN COALESCE(_force, false) AND NULLIF(btrim(COALESCE(_scene.lip_sync_source_clip_url, '')), '') IS NOT NULL
      THEN _scene.lip_sync_source_clip_url
    ELSE _scene.clip_url
  END;

  UPDATE public.composer_scenes
  SET lip_sync_status = 'pending',
      twoshot_stage = NULL,
      replicate_prediction_id = NULL,
      dialog_shots = NULL,
      clip_error = NULL,
      base_video_url = _restored,
      processed_video_url = NULL,
      clip_url = _restored,
      clip_status = CASE WHEN _restored IS NOT NULL THEN 'ready'
                         ELSE COALESCE(_scene.clip_status, 'pending') END,
      lip_sync_source_clip_url = NULL,
      lip_sync_applied_at = NULL,
      audio_plan = _plan,
      updated_at = _now
  WHERE id = _scene_id;

  -- 8. Audit
  PERFORM public.composer_log_sync_segment_audit(
    _scene.id, _scene.project_id, _scene.pipeline_state, _scene.pipeline_state,
    _scene.active_run_id, _scene.plate_generation, 'rs3:reset', true, 'user_reset',
    jsonb_build_object(
      'reset_id', _reset_id::text,
      'canceled_job_ids', to_jsonb(_canceled),
      'authorized_segments', to_jsonb(_segments)
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'outcome', 'reset',
    'reset_id', _reset_id::text,
    'scene_id', _scene_id,
    'run_id', _scene.active_run_id,
    'plate_generation', _scene.plate_generation,
    'canceled_job_ids', to_jsonb(_canceled),
    'external_job_ids', to_jsonb(_external),
    'authorized_segments', to_jsonb(_segments),
    'refund_credits', CASE WHEN _refund_claimed THEN _cost ELSE 0 END,
    'refund_claimed', _refund_claimed
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.composer_reset_lipsync_with_attempt_cancellation(uuid, uuid, integer, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.composer_reset_lipsync_with_attempt_cancellation(uuid, uuid, integer, boolean) TO service_role;

-- ============================================================================
-- §5/§5b — gemeinsamer interner Core
-- Lock-Ordnung: advisory(scene) -> predecessor FOR UPDATE -> scene FOR UPDATE
-- ============================================================================
CREATE OR REPLACE FUNCTION public.composer_rs3_acquire_core(
  _scene_id uuid,
  _run_id uuid,
  _stage text,
  _plate_generation integer,
  _segment_id uuid,
  _provider text,
  _metadata jsonb,
  _rearm_only boolean
)
RETURNS TABLE(job_id uuid, attempt_no integer, outcome text, status text, rs3_outcome text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _scene public.composer_scenes%ROWTYPE;
  _prev public.composer_pipeline_jobs%ROWTYPE;
  _prev_id uuid;
  _epoch public.composer_pipeline_jobs%ROWTYPE;
  _marker jsonb;
  _reset_id text;
  _seg_key text := COALESCE(_segment_id::text, '-');
  _authorized boolean := false;
  _twoshot jsonb;
  _plan jsonb;
  _new_id uuid;
  _new_attempt integer;
  _key text;
  _meta jsonb;
  _row record;
BEGIN
  IF _scene_id IS NULL OR _run_id IS NULL OR _stage IS NULL THEN
    RAISE EXCEPTION 'rs3_acquire: scene_id, run_id and stage are mandatory'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _stage NOT IN ('sync_segment', 'audio_mux') THEN
    RAISE EXCEPTION 'rs3_acquire: stage % is not a lip-sync stage', _stage
      USING ERRCODE = 'check_violation';
  END IF;
  IF _plate_generation IS NULL THEN
    RAISE EXCEPTION 'rs3_acquire: plate_generation is mandatory (scene %, stage %)',
      _scene_id, _stage USING ERRCODE = 'check_violation';
  END IF;

  -- 1. Advisory
  PERFORM pg_advisory_xact_lock(hashtextextended(_scene_id::text, 0));

  -- 2. juengster Vorgaenger derselben Identitaet -> FOR UPDATE
  SELECT j.id INTO _prev_id
  FROM public.composer_pipeline_jobs j
  WHERE j.scene_id = _scene_id
    AND j.run_id = _run_id
    AND j.stage = _stage
    AND j.segment_id IS NOT DISTINCT FROM _segment_id
  ORDER BY j.attempt_no DESC
  LIMIT 1;

  IF _prev_id IS NOT NULL THEN
    SELECT * INTO _prev FROM public.composer_pipeline_jobs WHERE id = _prev_id FOR UPDATE;
  END IF;

  -- 3. Scene FOR UPDATE
  SELECT * INTO _scene FROM public.composer_scenes WHERE id = _scene_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::uuid, NULL::integer, 'unavailable'::text, NULL::text, 'scene_not_found'::text;
    RETURN;
  END IF;

  -- 4. Marker lesen
  _plan := COALESCE(_scene.audio_plan, '{}'::jsonb);
  _twoshot := COALESCE(_plan->'twoshot', '{}'::jsonb);
  _marker := _twoshot->'rs3_reset';
  IF _marker IS NOT NULL
     AND jsonb_typeof(_marker) = 'object'
     AND (_marker->>'run_id') IS NOT NULL
     AND (_marker->>'run_id')::uuid = _run_id
     AND _scene.active_run_id IS NOT DISTINCT FROM _run_id
     AND COALESCE((_marker->>'plate_generation')::integer, -1) = _plate_generation
     AND COALESCE(_scene.plate_generation, -1) = _plate_generation THEN
    _reset_id := _marker->>'reset_id';
  ELSE
    _reset_id := NULL;
  END IF;

  -- 4a. kein gueltiger Marker -> unveraenderter Initial-Acquire, 1:1 durchgereicht
  IF _reset_id IS NULL THEN
    IF COALESCE(_rearm_only, false) THEN
      RETURN QUERY SELECT NULL::uuid, NULL::integer, 'unavailable'::text, NULL::text, 'rearm_not_authorized'::text;
      RETURN;
    END IF;
    FOR _row IN
      SELECT * FROM public.composer_acquire_pipeline_attempt(
        _scene_id, _run_id, _stage, _plate_generation, NULL,
        _segment_id, NULL, _provider, COALESCE(_metadata, '{}'::jsonb))
    LOOP
      RETURN QUERY SELECT _row.job_id, _row.attempt_no, _row.outcome, _row.status, 'passthrough'::text;
    END LOOP;
    RETURN;
  END IF;

  -- 4b. Epoch-Idempotenz zuerst
  SELECT * INTO _epoch
  FROM public.composer_pipeline_jobs j
  WHERE j.scene_id = _scene_id
    AND j.run_id = _run_id
    AND j.stage = _stage
    AND j.segment_id IS NOT DISTINCT FROM _segment_id
    AND j.plate_generation IS NOT DISTINCT FROM _plate_generation
    AND j.metadata->>'rs3_reset_id' = _reset_id
  ORDER BY j.attempt_no DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT
      _epoch.id, _epoch.attempt_no, 'already_in_flight'::text, _epoch.status,
      CASE WHEN (_epoch.metadata->>'rearm_of') IS NOT NULL
           THEN 'already_rearmed' ELSE 'already_acquired' END::text;
    RETURN;
  END IF;

  -- 4c. Autorisierung pruefen
  IF _stage = 'audio_mux' THEN
    _authorized := COALESCE((_marker->>'mux_rearm_allowed')::boolean, false);
  ELSE
    _authorized := EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(_marker->'sync_segments') = 'array'
             THEN _marker->'sync_segments' ELSE '[]'::jsonb END) e
      WHERE e = _seg_key
    );
  END IF;

  IF NOT _authorized THEN
    RETURN QUERY SELECT NULL::uuid, NULL::integer, 'unavailable'::text, NULL::text,
      CASE WHEN COALESCE(_rearm_only, false) THEN 'rearm_not_authorized'
           ELSE 'rs3_rearm_unavailable' END::text;
    RETURN;
  END IF;

  _meta := COALESCE(_metadata, '{}'::jsonb) || jsonb_build_object('rs3_reset_id', _reset_id);

  -- 4d. kein Vorgaenger -> regulaerer Attempt 1, Autorisierung im selben Commit konsumiert
  IF _prev_id IS NULL THEN
    FOR _row IN
      SELECT * FROM public.composer_acquire_pipeline_attempt(
        _scene_id, _run_id, _stage, _plate_generation, NULL,
        _segment_id, NULL, _provider, _meta)
    LOOP
      _new_id := _row.job_id;
      _new_attempt := _row.attempt_no;
      job_id := _row.job_id; attempt_no := _row.attempt_no;
      outcome := _row.outcome; status := _row.status;
      rs3_outcome := 'acquired_no_predecessor';
    END LOOP;
  ELSE
    -- 4e. aktiver Fremd-Vorgaenger -> fail closed
    IF _prev.replaced_by IS NULL
       AND _prev.status = ANY (public.composer_rs3_reset_cancellable_statuses())
       AND COALESCE(_prev.metadata->>'rs3_reset_id', '') IS DISTINCT FROM _reset_id THEN
      RETURN QUERY SELECT _prev.id, _prev.attempt_no, 'already_in_flight'::text, _prev.status,
        'rearm_blocked_active_predecessor'::text;
      RETURN;
    END IF;

    -- 4f. Rearm: Nachfolger attempt_no + 1
    _new_attempt := _prev.attempt_no + 1;
    _key := concat_ws(':', _scene_id::text, _run_id::text, _stage, _seg_key, _new_attempt::text);

    INSERT INTO public.composer_pipeline_jobs (
      scene_id, run_id, run_contract_version, stage, segment_id, speaker_id,
      attempt_no, plate_generation, provider, idempotency_key, status,
      started_at, metadata
    ) VALUES (
      _scene_id, _run_id, _prev.run_contract_version, _stage,
      _segment_id, _prev.speaker_id,
      _new_attempt, _plate_generation, COALESCE(_provider, _prev.provider),
      _key, 'dispatching', now(),
      _meta || jsonb_build_object(
        'ledger_source', 'v431_rs3_reset_rearm',
        'rearm_of', _prev.id::text)
    )
    RETURNING id INTO _new_id;

    job_id := _new_id;
    attempt_no := _new_attempt;
    outcome := 'acquired';
    status := 'dispatching';
    rs3_outcome := 'rearmed';
  END IF;

  -- 4g. Autorisierung konsumieren (reset_id bleibt bestehen)
  IF _stage = 'audio_mux' THEN
    _marker := _marker || jsonb_build_object('mux_rearm_allowed', false);
  ELSE
    _marker := _marker || jsonb_build_object('sync_segments', COALESCE((
      SELECT jsonb_agg(e) FROM jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(_marker->'sync_segments') = 'array'
             THEN _marker->'sync_segments' ELSE '[]'::jsonb END) e
      WHERE e <> _seg_key), '[]'::jsonb));
  END IF;
  _twoshot := _twoshot || jsonb_build_object('rs3_reset', _marker);
  _plan := _plan || jsonb_build_object('twoshot', _twoshot);

  UPDATE public.composer_scenes
  SET audio_plan = _plan, updated_at = now()
  WHERE id = _scene_id;

  RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public.composer_rs3_acquire_core(uuid, uuid, text, integer, uuid, text, jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.composer_rs3_acquire_core(uuid, uuid, text, integer, uuid, text, jsonb, boolean) TO service_role;

-- §5 — expliziter Rearm-Einstiegspunkt (gleicher Core)
CREATE OR REPLACE FUNCTION public.composer_acquire_reset_rearmed_attempt(
  _scene_id uuid,
  _run_id uuid,
  _stage text,
  _plate_generation integer,
  _segment_id uuid,
  _provider text,
  _metadata jsonb
)
RETURNS TABLE(job_id uuid, attempt_no integer, outcome text, status text, rs3_outcome text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT * FROM public.composer_rs3_acquire_core(
    _scene_id, _run_id, _stage, _plate_generation, _segment_id, _provider, _metadata, true);
$function$;

REVOKE ALL ON FUNCTION public.composer_acquire_reset_rearmed_attempt(uuid, uuid, text, integer, uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.composer_acquire_reset_rearmed_attempt(uuid, uuid, text, integer, uuid, text, jsonb) TO service_role;

-- §5b — Serialized Acquire (einziger Dispatcher-Einstiegspunkt fuer Lip-Sync-Stages)
CREATE OR REPLACE FUNCTION public.composer_acquire_lipsync_attempt_serialized(
  _scene_id uuid,
  _run_id uuid,
  _stage text,
  _plate_generation integer,
  _segment_id uuid,
  _provider text,
  _metadata jsonb
)
RETURNS TABLE(job_id uuid, attempt_no integer, outcome text, status text, rs3_outcome text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT * FROM public.composer_rs3_acquire_core(
    _scene_id, _run_id, _stage, _plate_generation, _segment_id, _provider, _metadata, false);
$function$;

REVOKE ALL ON FUNCTION public.composer_acquire_lipsync_attempt_serialized(uuid, uuid, text, integer, uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.composer_acquire_lipsync_attempt_serialized(uuid, uuid, text, integer, uuid, text, jsonb) TO service_role;

-- ============================================================================
-- §6 — Epoch-Fence Helper + Sole-Owner-Wrapper fuer den Sync-Apply
-- Der G3.2.2-Apply-Body bleibt byte-identisch und wird nur umbenannt.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.composer_rs3_is_pre_reset_attempt(
  _scene_audio_plan jsonb,
  _scene_run_id uuid,
  _scene_plate_generation integer,
  _job_run_id uuid,
  _job_plate_generation integer,
  _job_metadata jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT CASE
    WHEN jsonb_typeof(COALESCE(_scene_audio_plan, '{}'::jsonb)->'twoshot'->'rs3_reset') <> 'object'
      THEN false
    WHEN (COALESCE(_scene_audio_plan, '{}'::jsonb)->'twoshot'->'rs3_reset'->>'run_id') IS DISTINCT FROM _scene_run_id::text
      THEN false
    WHEN _job_run_id IS DISTINCT FROM _scene_run_id THEN false
    WHEN COALESCE((COALESCE(_scene_audio_plan, '{}'::jsonb)->'twoshot'->'rs3_reset'->>'plate_generation')::integer, -1)
         IS DISTINCT FROM COALESCE(_scene_plate_generation, -1) THEN false
    WHEN COALESCE(_job_plate_generation, -1) IS DISTINCT FROM COALESCE(_scene_plate_generation, -1) THEN false
    ELSE COALESCE(_job_metadata->>'rs3_reset_id', '')
         IS DISTINCT FROM (COALESCE(_scene_audio_plan, '{}'::jsonb)->'twoshot'->'rs3_reset'->>'reset_id')
  END;
$function$;

REVOKE ALL ON FUNCTION public.composer_rs3_is_pre_reset_attempt(jsonb, uuid, integer, uuid, integer, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.composer_rs3_is_pre_reset_attempt(jsonb, uuid, integer, uuid, integer, jsonb) TO service_role;

ALTER FUNCTION public.composer_apply_sync_segment_result(uuid, text, text, text, text, text)
  RENAME TO composer_apply_sync_segment_result_core;

REVOKE ALL ON FUNCTION public.composer_apply_sync_segment_result_core(uuid, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.composer_apply_sync_segment_result_core(uuid, text, text, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.composer_apply_sync_segment_result(
  _pipeline_job_id uuid,
  _external_job_id text,
  _write_id text,
  _provider_status text,
  _output_url text,
  _error_text text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _job public.composer_pipeline_jobs%ROWTYPE;
  _scene public.composer_scenes%ROWTYPE;
BEGIN
  -- RS3 §6 — Epoch-Fence VOR dem eingefrorenen G3.2.2-Apply.
  -- Lock-Ordnung identisch zum Core: Job FOR UPDATE -> Scene FOR UPDATE.
  IF _pipeline_job_id IS NOT NULL THEN
    SELECT * INTO _job FROM public.composer_pipeline_jobs
    WHERE id = _pipeline_job_id FOR UPDATE;
    IF FOUND THEN
      SELECT * INTO _scene FROM public.composer_scenes WHERE id = _job.scene_id FOR UPDATE;
      IF FOUND AND public.composer_rs3_is_pre_reset_attempt(
           _scene.audio_plan, _scene.active_run_id, _scene.plate_generation,
           _job.run_id, _job.plate_generation, _job.metadata) THEN
        PERFORM public.composer_log_sync_segment_audit(
          _scene.id, _scene.project_id, _scene.pipeline_state, _scene.pipeline_state,
          _job.run_id, _job.plate_generation, _write_id, false,
          CASE WHEN _job.error_code = 'user_reset' THEN 'user_reset_discarded'
               ELSE 'pre_reset_attempt' END,
          jsonb_build_object(
            'pipeline_job_id', _job.id,
            'external_job_id', _external_job_id,
            'stage', _job.stage,
            'job_status', _job.status));
        RETURN jsonb_build_object('applied', false, 'verdict', 'rejected',
          'reason', CASE WHEN _job.error_code = 'user_reset' THEN 'user_reset_discarded'
                         ELSE 'pre_reset_attempt' END);
      END IF;
    END IF;
  END IF;

  RETURN public.composer_apply_sync_segment_result_core(
    _pipeline_job_id, _external_job_id, _write_id, _provider_status, _output_url, _error_text);
END;
$function$;

REVOKE ALL ON FUNCTION public.composer_apply_sync_segment_result(uuid, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.composer_apply_sync_segment_result(uuid, text, text, text, text, text) TO service_role;

-- §6 — Fence-Entscheid fuer die Mux-/Stitch-Entry-Points (Edge-seitig genutzt)
CREATE OR REPLACE FUNCTION public.composer_rs3_fence_verdict(
  _scene_id uuid,
  _pipeline_job_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _scene public.composer_scenes%ROWTYPE;
  _job public.composer_pipeline_jobs%ROWTYPE;
  _marker jsonb;
BEGIN
  SELECT * INTO _scene FROM public.composer_scenes WHERE id = _scene_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('fenced', false, 'reason', 'scene_not_found');
  END IF;

  _marker := COALESCE(_scene.audio_plan, '{}'::jsonb)->'twoshot'->'rs3_reset';
  IF jsonb_typeof(_marker) <> 'object'
     OR (_marker->>'run_id') IS DISTINCT FROM _scene.active_run_id::text
     OR COALESCE((_marker->>'plate_generation')::integer, -1)
        IS DISTINCT FROM COALESCE(_scene.plate_generation, -1) THEN
    RETURN jsonb_build_object('fenced', false, 'reason', 'no_marker');
  END IF;

  IF _pipeline_job_id IS NULL THEN
    -- Post-Reset-Dispatches tragen immer eine Ledger-Identitaet: fail closed.
    RETURN jsonb_build_object('fenced', true, 'reason', 'pre_reset_attempt',
      'reset_id', _marker->>'reset_id');
  END IF;

  SELECT * INTO _job FROM public.composer_pipeline_jobs WHERE id = _pipeline_job_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('fenced', true, 'reason', 'pre_reset_attempt',
      'reset_id', _marker->>'reset_id');
  END IF;

  IF public.composer_rs3_is_pre_reset_attempt(
       _scene.audio_plan, _scene.active_run_id, _scene.plate_generation,
       _job.run_id, _job.plate_generation, _job.metadata) THEN
    RETURN jsonb_build_object('fenced', true,
      'reason', CASE WHEN _job.error_code = 'user_reset' THEN 'user_reset_discarded'
                     ELSE 'pre_reset_attempt' END,
      'reset_id', _marker->>'reset_id');
  END IF;

  RETURN jsonb_build_object('fenced', false, 'reason', 'current_epoch');
END;
$function$;

REVOKE ALL ON FUNCTION public.composer_rs3_fence_verdict(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.composer_rs3_fence_verdict(uuid, uuid) TO service_role;