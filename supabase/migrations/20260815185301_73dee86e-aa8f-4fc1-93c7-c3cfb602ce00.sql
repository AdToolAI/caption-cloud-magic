-- ── R2: interner Progress-Helper (Contract §7) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.composer_touch_lipsync_progress(
  _scene_id uuid,
  _dialog_shots jsonb,
  _done integer,
  _total integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
BEGIN
  UPDATE public.composer_scenes
  SET dialog_shots = _dialog_shots,
      lip_sync_status = 'running',
      twoshot_stage = 'syncso_fanout_' || _done || '_of_' || _total,
      updated_at = now()
  WHERE id = _scene_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.composer_touch_lipsync_progress(uuid, jsonb, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.composer_touch_lipsync_progress(uuid, jsonb, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.composer_touch_lipsync_progress(uuid, jsonb, integer, integer) FROM authenticated;
REVOKE ALL ON FUNCTION public.composer_touch_lipsync_progress(uuid, jsonb, integer, integer) FROM service_role;

-- ── R6: interner Audit-Writer auf bestehender G0/G3-Infrastruktur ──────────
CREATE OR REPLACE FUNCTION public.composer_log_sync_segment_audit(
  _scene_id uuid,
  _project_id uuid,
  _from_state public.composer_scene_state,
  _to_state public.composer_scene_state,
  _run_id uuid,
  _generation integer,
  _write_id text,
  _applied boolean,
  _reason text,
  _detail jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
BEGIN
  INSERT INTO public.composer_scene_transition_log (
    scene_id, project_id, from_state, to_state, step_index, is_intermediate,
    guard_mode, run_id, generation, write_id, applied, reason,
    source_signature, caller_class, caller_role, auth_uid, detail
  ) VALUES (
    _scene_id, _project_id, _from_state, _to_state, 1, false,
    'run_bound', _run_id, _generation, _write_id, _applied, _reason,
    'g322_sync_segment', 'sync_segment_apply', current_user, NULL, _detail::text
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.composer_log_sync_segment_audit(uuid, uuid, public.composer_scene_state, public.composer_scene_state, uuid, integer, text, boolean, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.composer_log_sync_segment_audit(uuid, uuid, public.composer_scene_state, public.composer_scene_state, uuid, integer, text, boolean, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.composer_log_sync_segment_audit(uuid, uuid, public.composer_scene_state, public.composer_scene_state, uuid, integer, text, boolean, text, jsonb) FROM authenticated;
REVOKE ALL ON FUNCTION public.composer_log_sync_segment_audit(uuid, uuid, public.composer_scene_state, public.composer_scene_state, uuid, integer, text, boolean, text, jsonb) FROM service_role;

-- ── R3: Legacy-Wert audio_muxing kennen (nie lipsync_muxing vorziehen) ─────
CREATE OR REPLACE FUNCTION public.composer_state_from_legacy(_clip_status text, _twoshot_stage text, _lip_sync_status text, _clip_url text, _active_run_id uuid, _audio_plan jsonb)
 RETURNS public.composer_scene_state
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _clip_status = 'canceled' OR _lip_sync_status = 'canceled' THEN 'canceled'
    WHEN _clip_status = 'failed'
      OR _twoshot_stage IN ('failed','audio_mux_failed')
      OR _lip_sync_status = 'failed' THEN 'failed'
    WHEN _lip_sync_status IN ('done','applied')
      OR _twoshot_stage IN ('done','complete','applied') THEN 'complete'
    WHEN _lip_sync_status = 'stitching' THEN 'lipsync_muxing'
    WHEN _lip_sync_status = 'audio_muxing' OR _twoshot_stage = 'audio_muxing' THEN 'lipsync_running'
    WHEN _lip_sync_status = 'running' OR _twoshot_stage = 'lipsync' THEN 'lipsync_running'
    WHEN _twoshot_stage = 'master_clip' THEN 'audio_ready'
    WHEN _twoshot_stage = 'audio' THEN 'audio_prep'
    WHEN _clip_status IN ('ready','completed')
      AND _clip_url IS NOT NULL AND length(_clip_url) > 0 THEN 'plate_ready'
    WHEN _clip_status IN ('generating','rendering','processing') THEN 'plate_rendering'
    WHEN _clip_status IN ('queued','pending') AND _active_run_id IS NOT NULL THEN 'plate_queued'
    ELSE 'idle'
  END::public.composer_scene_state;
$function$;

CREATE OR REPLACE FUNCTION public.composer_scene_state_bridge()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  legacy_changed boolean;
  state_changed boolean;
  substate_changed boolean;
  derived public.composer_scene_state;
  derived_substate text;
  legacy_audio_mux boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.pipeline_state = 'idle' THEN
      NEW.pipeline_state := public.composer_state_from_legacy(
        NEW.clip_status, NEW.twoshot_stage, NEW.lip_sync_status,
        NEW.clip_url, NEW.active_run_id, NEW.audio_plan);
    END IF;
    NEW.pipeline_substate := COALESCE(
      NEW.pipeline_substate,
      public.composer_substate_from_legacy(NEW.clip_status, NEW.twoshot_stage, NEW.lip_sync_status)
    );
    NEW.pipeline_state_at := now();
    NEW.pipeline_substate_at := now();
    RETURN NEW;
  END IF;

  state_changed := NEW.pipeline_state IS DISTINCT FROM OLD.pipeline_state;
  legacy_changed :=
    NEW.clip_status     IS DISTINCT FROM OLD.clip_status
    OR NEW.twoshot_stage   IS DISTINCT FROM OLD.twoshot_stage
    OR NEW.lip_sync_status IS DISTINCT FROM OLD.lip_sync_status
    OR NEW.clip_url        IS DISTINCT FROM OLD.clip_url;
  substate_changed := NEW.pipeline_substate IS DISTINCT FROM OLD.pipeline_substate;

  -- New-path write: state changed. Sync legacy columns if they weren't touched,
  -- and accept an explicit substate if provided.
  IF state_changed THEN
    IF NOT legacy_changed THEN
      CASE NEW.pipeline_state
        WHEN 'idle' THEN
          NEW.clip_status := 'pending'; NEW.twoshot_stage := NULL; NEW.lip_sync_status := NULL;
        WHEN 'plate_queued' THEN
          NEW.clip_status := 'queued'; NEW.twoshot_stage := NULL; NEW.lip_sync_status := NULL;
        WHEN 'plate_rendering' THEN
          NEW.clip_status := 'generating'; NEW.twoshot_stage := NULL; NEW.lip_sync_status := NULL;
        WHEN 'plate_ready' THEN
          NEW.clip_status := 'ready'; NEW.twoshot_stage := NULL;
        WHEN 'audio_prep' THEN
          NEW.clip_status := 'ready'; NEW.twoshot_stage := 'audio';
        WHEN 'audio_ready' THEN
          NEW.clip_status := 'ready'; NEW.twoshot_stage := 'master_clip';
        WHEN 'lipsync_dispatched' THEN
          NEW.clip_status := 'ready'; NEW.twoshot_stage := 'lipsync'; NEW.lip_sync_status := 'running';
        WHEN 'lipsync_running' THEN
          NEW.clip_status := 'ready'; NEW.twoshot_stage := 'lipsync'; NEW.lip_sync_status := 'running';
        WHEN 'lipsync_muxing' THEN
          NEW.clip_status := 'ready'; NEW.twoshot_stage := 'lipsync'; NEW.lip_sync_status := 'stitching';
        WHEN 'complete' THEN
          NEW.clip_status := 'ready'; NEW.twoshot_stage := 'done';
          IF NEW.lip_sync_status IS NOT NULL THEN NEW.lip_sync_status := 'done'; END IF;
        WHEN 'failed' THEN
          NEW.twoshot_stage := 'failed';
          IF NEW.clip_url IS NULL OR length(NEW.clip_url) = 0 THEN
            NEW.clip_status := 'failed';
          END IF;
          IF NEW.lip_sync_status IS NOT NULL THEN NEW.lip_sync_status := 'failed'; END IF;
        WHEN 'canceled' THEN
          NEW.clip_status := 'canceled';
          IF NEW.lip_sync_status IS NOT NULL THEN NEW.lip_sync_status := 'canceled'; END IF;
        ELSE
          NULL;
      END CASE;
    END IF;
    NEW.pipeline_state_at := now();
    -- If the new-path writer did not provide a substate, clear it on terminal/main states
    -- (the legacy mirror above already encodes the detail in twoshot_stage for lip-sync).
    IF NEW.pipeline_substate IS NULL THEN
      NEW.pipeline_substate_at := now();
    END IF;

  ELSIF legacy_changed OR (NEW.clip_url IS DISTINCT FROM OLD.clip_url) THEN
    -- Old-path write: derive state and substate from legacy columns.
    derived := public.composer_state_from_legacy(
      NEW.clip_status, NEW.twoshot_stage, NEW.lip_sync_status,
      NEW.clip_url, NEW.active_run_id, NEW.audio_plan);

    -- v431 G3.2.2 R3: `audio_muxing` is the legacy mux-handoff marker written by the
    -- sync apply. It maps to at most `lipsync_running` and must never regress a scene
    -- that the mux owner already advanced. Monotone clamp, nothing else changes.
    legacy_audio_mux := (NEW.lip_sync_status = 'audio_muxing' OR NEW.twoshot_stage = 'audio_muxing');
    IF legacy_audio_mux
       AND NEW.pipeline_state IN ('lipsync_muxing'::public.composer_scene_state,
                                  'complete'::public.composer_scene_state) THEN
      derived := NEW.pipeline_state;
    END IF;

    -- v398: The rolled-back lip-sync chain writes legacy columns. The v387 block
    -- (legacy may not raise into audio/lip-sync phases) is lifted so scenes do not
    -- get stuck at "Lip-Sync wird gestartet".
    IF derived IS DISTINCT FROM NEW.pipeline_state THEN
      NEW.pipeline_state := derived;
      NEW.pipeline_state_at := now();
    END IF;

    derived_substate := public.composer_substate_from_legacy(
      NEW.clip_status, NEW.twoshot_stage, NEW.lip_sync_status);
    IF derived_substate IS DISTINCT FROM NEW.pipeline_substate THEN
      NEW.pipeline_substate := derived_substate;
      NEW.pipeline_substate_at := now();
    END IF;
  END IF;

  -- If an explicit substate was provided alongside a state change, keep it and stamp it.
  IF substate_changed AND NEW.pipeline_substate IS NOT NULL THEN
    NEW.pipeline_substate_at := now();
  END IF;

  RETURN NEW;
END;
$function$;

-- ── R1 / R5 / R6: autoritativer Sync-Segment-Apply ─────────────────────────
CREATE OR REPLACE FUNCTION public.composer_apply_sync_segment_result(_pipeline_job_id uuid, _external_job_id text, _write_id text, _provider_status text, _output_url text, _error_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _job public.composer_pipeline_jobs%ROWTYPE;
  _repl public.composer_pipeline_jobs%ROWTYPE;
  _scene public.composer_scenes%ROWTYPE;
  _ds jsonb;
  _arr jsonb;
  _slot jsonb;
  _pass_idx integer;
  _patch jsonb;
  _segment_result text;
  _scene_verdict text;
  _replacement_id uuid;
  _new_attempt integer;
  _total integer;
  _len integer;
  _done integer;
  _failed integer;
  _all_terminal boolean;
  _partial_allowed boolean;
  _final_url text;
  _mux_exists boolean;
  _next_pending integer;
  _cost numeric := 0;
  _already_refunded boolean := false;
  _err text;
  _i integer;
  _p jsonb;
  _from_state public.composer_scene_state;
  _to_state public.composer_scene_state;
  _recovered boolean := false;
  _audit jsonb;
BEGIN
  _err := left(COALESCE(NULLIF(btrim(_error_text), ''), ''), 500);

  -- ── Geschlossene write_id/provider_status/output-Matrix ─────────────────
  -- (Pre-Resolution: ohne autoritative Ledger-Zeile wird nicht auditiert; die
  --  Provenienz-Telemetrie dafuer liegt in composer_callback_observations.)
  IF _write_id = 'ssw:success' THEN
    IF _provider_status IS DISTINCT FROM 'COMPLETED'
       OR COALESCE(btrim(_output_url), '') = '' THEN
      RETURN jsonb_build_object('applied', false, 'verdict', 'rejected', 'reason', 'write_id_mismatch');
    END IF;
  ELSIF _write_id = 'ssw:failed' THEN
    IF _provider_status IS NULL
       OR _provider_status NOT IN ('FAILED', 'REJECTED', 'CANCELED')
       OR _output_url IS NOT NULL THEN
      RETURN jsonb_build_object('applied', false, 'verdict', 'rejected', 'reason', 'write_id_mismatch');
    END IF;
  ELSIF _write_id IN ('ssw:noop_fail', 'ssw:noop_escalate') THEN
    IF _provider_status IS DISTINCT FROM 'COMPLETED' OR _output_url IS NOT NULL THEN
      RETURN jsonb_build_object('applied', false, 'verdict', 'rejected', 'reason', 'write_id_mismatch');
    END IF;
  ELSE
    RETURN jsonb_build_object('applied', false, 'verdict', 'rejected', 'reason', 'write_id_not_allowed');
  END IF;

  -- ── Provenienz: Ledger-Zeile ist Autoritaet (D1-Lockreihenfolge) ────────
  IF _pipeline_job_id IS NULL THEN
    RETURN jsonb_build_object('applied', false, 'verdict', 'rejected', 'reason', 'missing_binding');
  END IF;

  SELECT * INTO _job FROM public.composer_pipeline_jobs
  WHERE id = _pipeline_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('applied', false, 'verdict', 'rejected', 'reason', 'job_not_found');
  END IF;

  SELECT * INTO _scene FROM public.composer_scenes WHERE id = _job.scene_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('applied', false, 'verdict', 'rejected', 'reason', 'scene_not_found');
  END IF;

  -- Ab hier ist die Ledger-Zeile autoritativ aufgeloest: jedes Verdikt wird auditiert.
  _from_state := _scene.pipeline_state;
  _audit := jsonb_build_object(
    'pipeline_job_id', _job.id,
    'external_job_id', _external_job_id,
    'stage', _job.stage,
    'job_status', _job.status
  );

  IF _job.stage IS DISTINCT FROM 'sync_segment' THEN
    PERFORM public.composer_log_sync_segment_audit(
      _scene.id, _scene.project_id, _from_state, _from_state, _job.run_id,
      _job.plate_generation, _write_id, false, 'wrong_stage', _audit);
    RETURN jsonb_build_object('applied', false, 'verdict', 'rejected', 'reason', 'wrong_stage');
  END IF;

  IF _job.external_job_id IS NULL THEN
    PERFORM public.composer_log_sync_segment_audit(
      _scene.id, _scene.project_id, _from_state, _from_state, _job.run_id,
      _job.plate_generation, _write_id, false, 'binding_pending', _audit);
    RETURN jsonb_build_object('applied', false, 'verdict', 'rejected', 'reason', 'binding_pending');
  END IF;
  IF _job.external_job_id IS DISTINCT FROM _external_job_id THEN
    PERFORM public.composer_log_sync_segment_audit(
      _scene.id, _scene.project_id, _from_state, _from_state, _job.run_id,
      _job.plate_generation, _write_id, false, 'wrong_job', _audit);
    RETURN jsonb_build_object('applied', false, 'verdict', 'rejected', 'reason', 'wrong_job');
  END IF;
  IF _job.run_id IS DISTINCT FROM _scene.active_run_id THEN
    PERFORM public.composer_log_sync_segment_audit(
      _scene.id, _scene.project_id, _from_state, _from_state, _job.run_id,
      _job.plate_generation, _write_id, false, 'stale_run', _audit);
    RETURN jsonb_build_object('applied', false, 'verdict', 'rejected', 'reason', 'stale_run');
  END IF;
  IF _job.plate_generation IS DISTINCT FROM _scene.plate_generation THEN
    PERFORM public.composer_log_sync_segment_audit(
      _scene.id, _scene.project_id, _from_state, _from_state, _job.run_id,
      _job.plate_generation, _write_id, false, 'stale_generation', _audit);
    RETURN jsonb_build_object('applied', false, 'verdict', 'rejected', 'reason', 'stale_generation');
  END IF;

  IF _job.metadata IS NULL OR (_job.metadata->>'pass_idx') IS NULL THEN
    PERFORM public.composer_log_sync_segment_audit(
      _scene.id, _scene.project_id, _from_state, _from_state, _job.run_id,
      _job.plate_generation, _write_id, false, 'pass_identity_missing', _audit);
    RETURN jsonb_build_object('applied', false, 'verdict', 'rejected', 'reason', 'pass_identity_missing');
  END IF;
  _pass_idx := (_job.metadata->>'pass_idx')::integer;
  _audit := _audit || jsonb_build_object('pass_idx', _pass_idx);

  _ds := COALESCE(_scene.dialog_shots, '{}'::jsonb);
  _arr := CASE WHEN jsonb_typeof(_ds->'passes') = 'array' THEN _ds->'passes' ELSE '[]'::jsonb END;
  _len := jsonb_array_length(_arr);
  IF _len <= _pass_idx THEN
    PERFORM public.composer_log_sync_segment_audit(
      _scene.id, _scene.project_id, _from_state, _from_state, _job.run_id,
      _job.plate_generation, _write_id, false, 'wrong_pass', _audit);
    RETURN jsonb_build_object('applied', false, 'verdict', 'rejected', 'reason', 'wrong_pass');
  END IF;
  _slot := COALESCE(_arr->_pass_idx, '{}'::jsonb);
  _total := GREATEST(COALESCE(NULLIF(_ds->>'total_passes', '')::integer, _len), 1);
  _cost := COALESCE(NULLIF(_ds->>'cost_credits', '')::numeric, 0);
  _already_refunded := COALESCE((_ds->>'refunded')::boolean, false);

  -- ── §8 Duplicate-Matrix (vor jeder Mutation) ───────────────────────────
  IF _job.status = 'succeeded' THEN
    IF _write_id <> 'ssw:success'
       OR (_slot->>'output_url') IS DISTINCT FROM _output_url THEN
      PERFORM public.composer_log_sync_segment_audit(
        _scene.id, _scene.project_id, _from_state, _from_state, _job.run_id,
        _job.plate_generation, _write_id, false, 'conflicting_duplicate', _audit);
      RETURN jsonb_build_object('applied', false, 'verdict', 'rejected',
        'reason', 'conflicting_duplicate', 'pass_idx', _pass_idx);
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM public.composer_pipeline_jobs
      WHERE scene_id = _job.scene_id AND run_id = _job.run_id
        AND stage = 'audio_mux'
        AND plate_generation IS NOT DISTINCT FROM _job.plate_generation
    ) INTO _mux_exists;

    _done := 0; _failed := 0;
    FOR _i IN 0.._len - 1 LOOP
      _p := _arr->_i;
      IF (_p->>'status') = 'done' THEN _done := _done + 1;
      ELSIF (_p->>'status') IN ('failed', 'canceled_by_scene_failure') THEN _failed := _failed + 1;
      END IF;
    END LOOP;
    _all_terminal := (_done + _failed) >= _len;
    _partial_allowed := _total <= 2;

    IF NOT _mux_exists AND _all_terminal AND _done > 0
       AND (_failed = 0 OR _partial_allowed) THEN
      _final_url := NULL;
      FOR _i IN REVERSE _len - 1..0 LOOP
        _p := _arr->_i;
        IF (_p->>'status') = 'done' AND COALESCE(_p->>'output_url', '') <> '' THEN
          _final_url := _p->>'output_url'; EXIT;
        END IF;
      END LOOP;
      -- R1: Parent explizit erzeugen/mergen, danach ausschliesslich den
      -- re-drivable Request-Claim setzen. `dispatched_at` gehoert dem
      -- Dispatch-Owner nach erfolgreichem audio_mux-Acquire.
      _ds := jsonb_set(_ds, ARRAY['audio_mux'],
                       COALESCE(_ds->'audio_mux', '{}'::jsonb), true);
      _ds := jsonb_set(_ds, ARRAY['audio_mux', 'mux_dispatch_requested_at'],
                       to_jsonb(now()::text), true);
      UPDATE public.composer_scenes SET dialog_shots = _ds, updated_at = now()
      WHERE id = _scene.id;
      SELECT pipeline_state INTO _to_state FROM public.composer_scenes WHERE id = _scene.id;
      PERFORM public.composer_log_sync_segment_audit(
        _scene.id, _scene.project_id, _from_state, _to_state, _job.run_id,
        _job.plate_generation, _write_id, false, 'duplicate_redrive',
        _audit || jsonb_build_object('verdict', 'dispatch_mux', 'segment_result', 'succeeded'));
      RETURN jsonb_build_object('applied', false, 'verdict', 'dispatch_mux',
        'segment_result', 'succeeded', 'scene_verdict', 'dispatch_mux',
        'pass_idx', _pass_idx, 'reason', 'duplicate_redrive',
        'final_url', _final_url, 'total_passes', _total, 'done_count', _done);
    END IF;

    PERFORM public.composer_log_sync_segment_audit(
      _scene.id, _scene.project_id, _from_state, _from_state, _job.run_id,
      _job.plate_generation, _write_id, false, 'duplicate_callback',
      _audit || jsonb_build_object('verdict', 'noop', 'segment_result', 'succeeded'));
    RETURN jsonb_build_object('applied', false, 'verdict', 'noop',
      'segment_result', 'succeeded', 'pass_idx', _pass_idx, 'reason', 'duplicate_callback');
  END IF;

  IF _job.status IN ('failed', 'stale', 'cancelled') OR _job.replaced_by IS NOT NULL THEN
    IF _job.error_code = 'sync_noop_retryable' AND _job.replaced_by IS NOT NULL THEN
      SELECT * INTO _repl FROM public.composer_pipeline_jobs WHERE id = _job.replaced_by;
      IF FOUND AND _repl.external_job_id IS NULL
         AND _repl.status IN ('pending', 'dispatching') THEN
        PERFORM public.composer_log_sync_segment_audit(
          _scene.id, _scene.project_id, _from_state, _from_state, _job.run_id,
          _job.plate_generation, _write_id, false, 'duplicate_redrive',
          _audit || jsonb_build_object('verdict', 'redispatch', 'segment_result', 'failed',
                                       'replacement_job_id', _repl.id));
        RETURN jsonb_build_object('applied', false, 'verdict', 'redispatch',
          'segment_result', 'failed', 'scene_verdict', 'redispatch',
          'pass_idx', _pass_idx, 'replacement_job_id', _repl.id,
          'reason', 'duplicate_redrive');
      END IF;
      PERFORM public.composer_log_sync_segment_audit(
        _scene.id, _scene.project_id, _from_state, _from_state, _job.run_id,
        _job.plate_generation, _write_id, false, 'duplicate_callback',
        _audit || jsonb_build_object('verdict', 'noop', 'segment_result', 'failed'));
      RETURN jsonb_build_object('applied', false, 'verdict', 'noop',
        'segment_result', 'failed', 'pass_idx', _pass_idx, 'reason', 'duplicate_callback');
    END IF;
    IF _write_id = 'ssw:success' THEN
      PERFORM public.composer_log_sync_segment_audit(
        _scene.id, _scene.project_id, _from_state, _from_state, _job.run_id,
        _job.plate_generation, _write_id, false, 'conflicting_duplicate', _audit);
      RETURN jsonb_build_object('applied', false, 'verdict', 'rejected',
        'reason', 'conflicting_duplicate', 'pass_idx', _pass_idx);
    END IF;
    PERFORM public.composer_log_sync_segment_audit(
      _scene.id, _scene.project_id, _from_state, _from_state, _job.run_id,
      _job.plate_generation, _write_id, false, 'attempt_superseded',
      _audit || jsonb_build_object('verdict', 'noop', 'segment_result', 'failed'));
    RETURN jsonb_build_object('applied', false, 'verdict', 'noop',
      'segment_result', 'failed', 'pass_idx', _pass_idx, 'reason', 'attempt_superseded');
  END IF;

  -- ── Pointer-Bestaetigung (Identitaet kam aus dem Ledger) ────────────────
  IF (_slot->>'pipeline_job_id') IS DISTINCT FROM _pipeline_job_id::text
     OR (_slot->>'job_id') IS DISTINCT FROM _external_job_id THEN
    PERFORM public.composer_log_sync_segment_audit(
      _scene.id, _scene.project_id, _from_state, _from_state, _job.run_id,
      _job.plate_generation, _write_id, false, 'wrong_pass', _audit);
    RETURN jsonb_build_object('applied', false, 'verdict', 'rejected',
      'reason', 'wrong_pass', 'pass_idx', _pass_idx);
  END IF;

  -- ── R5: eng geguardete Recovery-Vorstufe (ex sync-so-webhook L598-607) ──
  -- Nur nach bestandener Ledger-/Run-/Generation-/Job-/Pass-Provenienz, nur bei
  -- COMPLETED und nur fuer das exakt bekannte selbstverursachte watchdog_*-Muster.
  -- Nimmt ausschliesslich die Failure-Mirrors zurueck und laeuft in denselben Apply.
  IF _write_id = 'ssw:success'
     AND (_scene.lip_sync_status = 'failed' OR (_ds->>'status') = 'failed')
     AND COALESCE(_scene.clip_error, '') ~ '^watchdog_(provider_timeout|auto_retry_|hard_timeout)' THEN
    _ds := jsonb_set(_ds, ARRAY['status'], '"rendering"'::jsonb, true);
    _ds := jsonb_set(_ds, ARRAY['recovered_from_watchdog_at'], to_jsonb(now()::text), true);
    UPDATE public.composer_scenes
    SET dialog_shots = _ds,
        lip_sync_status = 'running',
        twoshot_stage = CASE WHEN (_ds->>'engine') = 'sync-segments'
                             THEN 'syncso_fanout_recovering' ELSE 'running' END,
        clip_error = NULL,
        updated_at = now()
    WHERE id = _scene.id;
    _recovered := true;
    _audit := _audit || jsonb_build_object('watchdog_recovery', true,
                                           'prev_clip_error', _scene.clip_error);
  END IF;

  -- ── Deterministischer Slot-Patch ────────────────────────────────────────
  IF _write_id = 'ssw:success' THEN
    _patch := jsonb_build_object(
      'status', 'done',
      'output_url', _output_url,
      'finished_at', now()
    );
    _segment_result := 'succeeded';
  ELSIF _write_id = 'ssw:failed' THEN
    _patch := jsonb_build_object(
      'status', 'failed',
      'finished_at', now(),
      'last_error', left(_err, 300),
      'last_error_class', 'provider_' || lower(_provider_status)
    );
    _segment_result := 'failed';
  ELSIF _write_id = 'ssw:noop_fail' THEN
    _patch := jsonb_build_object(
      'status', 'failed',
      'finished_at', now(),
      'error', 'sync_noop_unrecoverable',
      'last_error', 'sync_noop_unrecoverable',
      'last_error_class', 'sync_noop_unrecoverable',
      'noop_reason', left(_err, 300)
    );
    _segment_result := 'failed';
  ELSE -- ssw:noop_escalate
    _patch := jsonb_build_object(
      'status', 'pending',
      'job_id', NULL,
      'pipeline_job_id', NULL,
      'output_url', NULL,
      'finished_at', NULL,
      'noop_escalation_step', COALESCE(NULLIF(_slot->>'noop_escalation_step', '')::integer, 0) + 1,
      'noop_retry_attempted', true,
      'noop_retry_reason', left(_err, 300)
    );
    _segment_result := 'failed';
  END IF;

  _ds := public.update_dialog_pass_slot(_scene.id, _pass_idx, _patch);
  _arr := CASE WHEN jsonb_typeof(_ds->'passes') = 'array' THEN _ds->'passes' ELSE '[]'::jsonb END;
  _len := jsonb_array_length(_arr);

  -- ── Ledger-Terminalisierung des Segments ────────────────────────────────
  UPDATE public.composer_pipeline_jobs
  SET status = CASE WHEN _write_id = 'ssw:success' THEN 'succeeded' ELSE 'failed' END,
      error_code = CASE
        WHEN _write_id = 'ssw:success' THEN NULL
        WHEN _write_id = 'ssw:noop_fail' THEN 'sync_noop_unrecoverable'
        WHEN _write_id = 'ssw:noop_escalate' THEN 'sync_noop_retryable'
        ELSE 'provider_' || lower(_provider_status)
      END,
      completed_at = now(),
      callback_delivery_status = 'succeeded',
      updated_at = now()
  WHERE id = _job.id;

  -- ── NOOP-Escalate: Replacement im selben Commit ─────────────────────────
  IF _write_id = 'ssw:noop_escalate' THEN
    SELECT r.job_id, r.attempt_no INTO _replacement_id, _new_attempt
    FROM public.composer_replace_pipeline_attempt(
      _job.id, _job.scene_id, _job.run_id, 'sync_segment', _job.plate_generation,
      _job.provider,
      jsonb_build_object(
        'dispatcher', 'sync-so-webhook',
        'pass_idx', _pass_idx,
        'total_passes', _total,
        'retry_reason', 'sync_noop_retryable',
        'retry_of_job_id', _job.id::text
      )
    ) AS r;

    UPDATE public.composer_scenes
    SET lip_sync_status = 'running',
        twoshot_stage = 'syncso_noop_escalation',
        updated_at = now()
    WHERE id = _scene.id;

    SELECT pipeline_state INTO _to_state FROM public.composer_scenes WHERE id = _scene.id;
    PERFORM public.composer_log_sync_segment_audit(
      _scene.id, _scene.project_id, _from_state, _to_state, _job.run_id,
      _job.plate_generation, _write_id, true, 'noop_escalate',
      _audit || jsonb_build_object('verdict', 'redispatch', 'segment_result', 'failed',
                                   'replacement_job_id', _replacement_id,
                                   'attempt_no', _new_attempt));

    RETURN jsonb_build_object(
      'applied', true, 'verdict', 'redispatch',
      'segment_result', 'failed', 'scene_verdict', 'redispatch',
      'pass_idx', _pass_idx, 'replacement_job_id', _replacement_id,
      'attempt_no', _new_attempt, 'total_passes', _total
    );
  END IF;

  -- ── Aggregat (§3/§3a) ───────────────────────────────────────────────────
  _done := 0; _failed := 0; _next_pending := NULL; _final_url := NULL;
  FOR _i IN 0.._len - 1 LOOP
    _p := _arr->_i;
    IF (_p->>'status') = 'done' THEN
      _done := _done + 1;
      IF COALESCE(_p->>'output_url', '') <> '' THEN _final_url := _p->>'output_url'; END IF;
    ELSIF (_p->>'status') IN ('failed', 'canceled_by_scene_failure') THEN
      _failed := _failed + 1;
    ELSIF _next_pending IS NULL
      AND ((_p->>'status') = 'pending' OR COALESCE(_p->>'job_id', '') = '') THEN
      _next_pending := _i;
    END IF;
  END LOOP;
  _all_terminal := (_done + _failed) >= _len;
  _partial_allowed := _total <= 2;

  IF _all_terminal AND _done > 0 AND (_failed = 0 OR _partial_allowed) THEN
    _scene_verdict := 'dispatch_mux';
  ELSIF _all_terminal AND _failed > 0 THEN
    _scene_verdict := 'fail';
  ELSE
    _scene_verdict := 'continue';
  END IF;

  IF _scene_verdict = 'dispatch_mux' THEN
    _ds := jsonb_set(_ds, ARRAY['status'], '"audio_muxing"'::jsonb, true);
    _ds := jsonb_set(_ds, ARRAY['final_url'], to_jsonb(_final_url), true);
    _ds := jsonb_set(_ds, ARRAY['finished_at'], to_jsonb(now()::text), true);
    IF _failed > 0 THEN
      _ds := jsonb_set(_ds, ARRAY['partial_mux'], 'true'::jsonb, true);
    END IF;
    -- R1: Parent erzeugen/mergen, danach ausschliesslich den Request-Claim setzen.
    -- Kein `dispatched_at` im Apply-RPC (Exactly-once bleibt am audio_mux-Acquire).
    _ds := jsonb_set(_ds, ARRAY['audio_mux'],
                     COALESCE(_ds->'audio_mux', '{}'::jsonb), true);
    _ds := jsonb_set(_ds, ARRAY['audio_mux', 'mux_dispatch_requested_at'],
                     to_jsonb(now()::text), true);

    UPDATE public.composer_scenes
    SET dialog_shots = _ds,
        lip_sync_status = 'audio_muxing',
        twoshot_stage = 'audio_muxing',
        clip_error = NULL,
        updated_at = now()
    WHERE id = _scene.id;

  ELSIF _scene_verdict = 'fail' THEN
    -- Alive-Siblings terminalisieren (kein Whole-JSON-Replace fremder Inhalte).
    FOR _i IN 0.._len - 1 LOOP
      _p := _arr->_i;
      IF _i <> _pass_idx AND (_p->>'status') IN ('rendering', 'retrying', 'pending') THEN
        _arr := jsonb_set(_arr, ARRAY[_i::text],
          _p || jsonb_build_object('status', 'canceled_by_scene_failure',
                                   'finished_at', now()), true);
      END IF;
    END LOOP;
    _ds := jsonb_set(_ds, ARRAY['passes'], _arr, true);
    _ds := jsonb_set(_ds, ARRAY['status'], '"failed"'::jsonb, true);
    _ds := jsonb_set(_ds, ARRAY['finished_at'], to_jsonb(now()::text), true);
    _ds := jsonb_set(_ds, ARRAY['error'], to_jsonb(_err), true);
    _ds := jsonb_set(_ds, ARRAY['scene_failure_source'], '"sync-so-webhook"'::jsonb, true);
    _ds := jsonb_set(_ds, ARRAY['watchdog_finalized'], 'false'::jsonb, true);
    _ds := jsonb_set(_ds, ARRAY['partial_done_count'], to_jsonb(_done), true);

    UPDATE public.composer_scenes
    SET dialog_shots = _ds,
        lip_sync_status = 'failed',
        twoshot_stage = CASE WHEN _write_id = 'ssw:noop_fail'
                             THEN 'needs_clip_rerender' ELSE 'failed' END,
        clip_error = _err,
        updated_at = now()
    WHERE id = _scene.id;

  ELSE
    -- R2: Progress-Semantik ausschliesslich ueber den internen Helper.
    PERFORM public.composer_touch_lipsync_progress(_scene.id, _ds, _done, _total);
  END IF;

  SELECT pipeline_state INTO _to_state FROM public.composer_scenes WHERE id = _scene.id;
  PERFORM public.composer_log_sync_segment_audit(
    _scene.id, _scene.project_id, _from_state, _to_state, _job.run_id,
    _job.plate_generation, _write_id, true, 'applied',
    _audit || jsonb_build_object('verdict', _scene_verdict, 'segment_result', _segment_result,
                                 'done_count', _done, 'failed_count', _failed,
                                 'total_passes', _total, 'watchdog_recovery', _recovered));

  RETURN jsonb_build_object(
    'applied', true,
    'verdict', _scene_verdict,
    'segment_result', _segment_result,
    'scene_verdict', _scene_verdict,
    'pass_idx', _pass_idx,
    'scene_id', _scene.id,
    'run_id', _job.run_id,
    'plate_generation', _job.plate_generation,
    'total_passes', _total,
    'done_count', _done,
    'failed_count', _failed,
    'final_url', _final_url,
    'next_pending_pass_idx', _next_pending,
    'watchdog_recovered', _recovered,
    'refund_due', CASE WHEN _scene_verdict = 'fail' AND NOT _already_refunded
                       THEN _cost ELSE 0 END,
    'already_refunded', _already_refunded
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.composer_apply_sync_segment_result(uuid, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.composer_apply_sync_segment_result(uuid, text, text, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.composer_apply_sync_segment_result(uuid, text, text, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.composer_apply_sync_segment_result(uuid, text, text, text, text, text) TO service_role;