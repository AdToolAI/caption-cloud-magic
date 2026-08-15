-- v431 G3.2.1 — Callback-Apply-Primitive A, H, D(ccw)
-- Vertrag: .lovable/plan/v431-g3-2-callback-apply-migration-autoritativer-endvertrag-2026-08-15.md

-- =====================================================================
-- A. composer_finalize_plate_scene
-- =====================================================================
CREATE OR REPLACE FUNCTION public.composer_finalize_plate_scene(
  _pipeline_job_id uuid,
  _external_job_id text,
  _write_id text,
  _base_video_url text,
  _clip_source_hint text DEFAULT NULL,
  _extra jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _job public.composer_pipeline_jobs%ROWTYPE;
  _scene public.composer_scenes%ROWTYPE;
  _verdict text := NULL;
  _res record;
  _caller_role text;
  _ambient jsonb;
  _continuity text;
  _cinematic boolean;
BEGIN
  _caller_role := coalesce(
    current_setting('request.jwt.claims', true)::jsonb ->> 'role',
    current_setting('request.jwt.claim.role', true),
    ''
  );

  IF _write_id IS DISTINCT FROM 'ccw:plate-complete' THEN
    RETURN jsonb_build_object('applied', false, 'verdict', 'write_id_not_allowed');
  END IF;

  SELECT * INTO _job FROM public.composer_pipeline_jobs WHERE id = _pipeline_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('applied', false, 'verdict', 'job_not_found');
  END IF;

  SELECT * INTO _scene FROM public.composer_scenes WHERE id = _job.scene_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('applied', false, 'verdict', 'scene_not_found');
  END IF;

  -- Identitätsprüfung (§2, exakte Reihenfolge)
  IF _job.stage IS DISTINCT FROM 'base_video' THEN
    _verdict := 'wrong_stage';
  ELSIF _job.external_job_id IS NULL THEN
    _verdict := 'binding_pending';
  ELSIF _job.external_job_id IS DISTINCT FROM _external_job_id THEN
    _verdict := 'wrong_job';
  ELSIF _job.run_id IS DISTINCT FROM _scene.active_run_id THEN
    _verdict := 'stale_run';
  ELSIF _job.plate_generation IS DISTINCT FROM _scene.plate_generation THEN
    _verdict := 'stale_generation';
  ELSIF _job.status = 'succeeded' THEN
    _verdict := 'duplicate_callback';
  ELSIF _job.status IN ('failed', 'cancelled', 'stale') OR _job.replaced_by IS NOT NULL THEN
    _verdict := 'attempt_superseded';
  ELSIF _base_video_url IS NULL OR length(btrim(_base_video_url)) = 0 THEN
    _verdict := 'base_video_url_required';
  END IF;

  IF _verdict IS NOT NULL THEN
    INSERT INTO public.composer_scene_transition_log (
      scene_id, project_id, from_state, to_state, step_index, is_intermediate,
      guard_mode, run_id, generation, write_id, applied, reason,
      source_signature, caller_class, caller_role, auth_uid
    ) VALUES (
      _scene.id, _scene.project_id, _scene.pipeline_state, 'plate_ready', 1, false,
      'run_bound', _job.run_id, _job.plate_generation, _write_id, false, _verdict,
      'v2', 'v2', _caller_role, auth.uid()
    );
    RETURN jsonb_build_object(
      'applied', false, 'verdict', _verdict, 'scene_id', _scene.id,
      'run_id', _job.run_id, 'plate_generation', _job.plate_generation,
      'stage', _job.stage, 'job_status', _job.status
    );
  END IF;

  SELECT * INTO _res FROM public.composer_scene_transition_core(
    _scene.id, 'plate_ready'::public.composer_scene_state, 'run_bound',
    _job.run_id, _job.plate_generation, NULL, _write_id,
    ARRAY['plate_rendering']::public.composer_scene_state[],
    NULL, NULL, NULL, false, false, true, 'v2', 'v2'
  );

  IF NOT _res.applied THEN
    RETURN jsonb_build_object(
      'applied', false,
      'verdict', CASE WHEN _res.reason = 'unexpected_from_state' THEN 'from_state_rejected' ELSE _res.reason END,
      'scene_id', _scene.id, 'run_id', _job.run_id,
      'plate_generation', _job.plate_generation, 'stage', _job.stage, 'job_status', _job.status
    );
  END IF;

  _continuity := nullif(btrim(coalesce(_extra ->> 'continuity_rendered_source_clip_url', '')), '');
  _ambient := CASE WHEN jsonb_typeof(_extra -> 'audio_plan_ambient_gate') = 'object'
                   THEN _extra -> 'audio_plan_ambient_gate' ELSE NULL END;
  _cinematic := coalesce((_extra ->> 'cinematic_sync')::boolean, false);

  UPDATE public.composer_scenes
  SET base_video_url = _base_video_url,
      processed_video_url = NULL,
      clip_url = _base_video_url,
      clip_status = 'ready',
      continuity_rendered_source_clip_url =
        CASE WHEN _extra ? 'continuity_rendered_source_clip_url'
             THEN _continuity ELSE continuity_rendered_source_clip_url END,
      audio_plan = CASE WHEN _ambient IS NULL THEN audio_plan
                        ELSE coalesce(audio_plan, '{}'::jsonb) || jsonb_build_object('ambientGate', _ambient) END,
      lip_sync_status = CASE WHEN _cinematic THEN 'pending' ELSE lip_sync_status END,
      twoshot_stage = CASE WHEN _cinematic THEN 'master_clip' ELSE twoshot_stage END,
      updated_at = now()
  WHERE id = _scene.id;

  UPDATE public.composer_pipeline_jobs
  SET status = 'succeeded',
      completed_at = now(),
      callback_delivery_status = 'succeeded',
      updated_at = now()
  WHERE id = _job.id;

  RETURN jsonb_build_object(
    'applied', true, 'verdict', 'applied', 'scene_id', _scene.id,
    'run_id', _job.run_id, 'plate_generation', _job.plate_generation,
    'stage', _job.stage, 'job_status', 'succeeded', 'state', _res.state
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.composer_finalize_plate_scene(uuid, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.composer_finalize_plate_scene(uuid, text, text, text, text, jsonb) TO service_role;

-- =====================================================================
-- D. composer_fail_callback_scene (G3.2.1-Scope: ccw:*)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.composer_fail_callback_scene(
  _pipeline_job_id uuid,
  _external_job_id text,
  _write_id text,
  _error_text text,
  _dialog_patch jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _job public.composer_pipeline_jobs%ROWTYPE;
  _scene public.composer_scenes%ROWTYPE;
  _verdict text := NULL;
  _res record;
  _caller_role text;
  _from public.composer_scene_state[];
  _substate text;
  _cinematic boolean;
BEGIN
  _caller_role := coalesce(
    current_setting('request.jwt.claims', true)::jsonb ->> 'role',
    current_setting('request.jwt.claim.role', true),
    ''
  );

  IF _write_id NOT IN ('ccw:failed', 'ccw:legacy_route_blocked') THEN
    RETURN jsonb_build_object('applied', false, 'verdict', 'write_id_not_allowed');
  END IF;

  SELECT * INTO _job FROM public.composer_pipeline_jobs WHERE id = _pipeline_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('applied', false, 'verdict', 'job_not_found');
  END IF;

  SELECT * INTO _scene FROM public.composer_scenes WHERE id = _job.scene_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('applied', false, 'verdict', 'scene_not_found');
  END IF;

  IF _job.stage IS DISTINCT FROM 'base_video' THEN
    _verdict := 'wrong_stage';
  ELSIF _job.external_job_id IS NULL THEN
    _verdict := 'binding_pending';
  ELSIF _job.external_job_id IS DISTINCT FROM _external_job_id THEN
    _verdict := 'wrong_job';
  ELSIF _job.run_id IS DISTINCT FROM _scene.active_run_id THEN
    _verdict := 'stale_run';
  ELSIF _job.plate_generation IS DISTINCT FROM _scene.plate_generation THEN
    _verdict := 'stale_generation';
  ELSIF _job.status = 'succeeded' THEN
    _verdict := 'duplicate_callback';
  ELSIF _job.status IN ('failed', 'cancelled', 'stale') OR _job.replaced_by IS NOT NULL THEN
    _verdict := 'attempt_superseded';
  END IF;

  IF _verdict IS NOT NULL THEN
    INSERT INTO public.composer_scene_transition_log (
      scene_id, project_id, from_state, to_state, step_index, is_intermediate,
      guard_mode, run_id, generation, write_id, applied, reason,
      source_signature, caller_class, caller_role, auth_uid
    ) VALUES (
      _scene.id, _scene.project_id, _scene.pipeline_state, 'failed', 1, false,
      'run_bound', _job.run_id, _job.plate_generation, _write_id, false, _verdict,
      'v2', 'v2', _caller_role, auth.uid()
    );
    RETURN jsonb_build_object(
      'applied', false, 'verdict', _verdict, 'scene_id', _scene.id,
      'run_id', _job.run_id, 'plate_generation', _job.plate_generation,
      'stage', _job.stage, 'job_status', _job.status
    );
  END IF;

  IF _write_id = 'ccw:failed' THEN
    _from := ARRAY['plate_queued', 'plate_rendering']::public.composer_scene_state[];
    _substate := 'plate_failed';
  ELSE
    _from := ARRAY['plate_ready', 'plate_rendering']::public.composer_scene_state[];
    _substate := 'legacy_route_blocked';
  END IF;

  SELECT * INTO _res FROM public.composer_scene_transition_core(
    _scene.id, 'failed'::public.composer_scene_state, 'run_bound',
    _job.run_id, _job.plate_generation, NULL, _write_id,
    _from, NULL, _substate, _error_text, false, false, false, 'v2', 'v2'
  );

  IF NOT _res.applied THEN
    RETURN jsonb_build_object(
      'applied', false,
      'verdict', CASE WHEN _res.reason = 'unexpected_from_state' THEN 'from_state_rejected' ELSE _res.reason END,
      'scene_id', _scene.id, 'run_id', _job.run_id,
      'plate_generation', _job.plate_generation, 'stage', _job.stage, 'job_status', _job.status
    );
  END IF;

  _cinematic := (_scene.engine_override = 'cinematic-sync');

  IF _write_id = 'ccw:failed' THEN
    UPDATE public.composer_scenes
    SET clip_status = 'failed',
        retry_count = coalesce(retry_count, 0) + 1,
        lip_sync_status = CASE WHEN _cinematic THEN NULL ELSE lip_sync_status END,
        twoshot_stage = CASE WHEN _cinematic THEN NULL ELSE twoshot_stage END,
        lip_sync_source_clip_url = CASE WHEN _cinematic THEN NULL ELSE lip_sync_source_clip_url END,
        dialog_shots = CASE WHEN _cinematic THEN NULL ELSE dialog_shots END,
        updated_at = now()
    WHERE id = _scene.id;
  ELSE
    UPDATE public.composer_scenes
    SET clip_status = 'failed',
        lip_sync_status = NULL,
        twoshot_stage = NULL,
        lip_sync_source_clip_url = NULL,
        dialog_shots = NULL,
        updated_at = now()
    WHERE id = _scene.id;
  END IF;

  UPDATE public.composer_pipeline_jobs
  SET status = 'failed',
      error_code = _write_id,
      completed_at = now(),
      callback_delivery_status = 'succeeded',
      updated_at = now()
  WHERE id = _job.id;

  RETURN jsonb_build_object(
    'applied', true, 'verdict', 'applied', 'scene_id', _scene.id,
    'run_id', _job.run_id, 'plate_generation', _job.plate_generation,
    'stage', _job.stage, 'job_status', 'failed', 'state', _res.state
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.composer_fail_callback_scene(uuid, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.composer_fail_callback_scene(uuid, text, text, text, jsonb) TO service_role;

-- =====================================================================
-- H. composer_fail_post_plate_handoff (kein Ledger-Job)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.composer_fail_post_plate_handoff(
  _scene_id uuid,
  _run_id uuid,
  _plate_generation integer,
  _write_id text,
  _error_text text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _scene public.composer_scenes%ROWTYPE;
  _res record;
  _caller_role text;
  _verdict text := NULL;
BEGIN
  _caller_role := coalesce(
    current_setting('request.jwt.claims', true)::jsonb ->> 'role',
    current_setting('request.jwt.claim.role', true),
    ''
  );

  IF _write_id IS DISTINCT FROM 'ccw:handoff_failed' THEN
    RETURN jsonb_build_object('applied', false, 'verdict', 'write_id_not_allowed');
  END IF;
  IF _run_id IS NULL OR _plate_generation IS NULL THEN
    RETURN jsonb_build_object('applied', false, 'verdict', 'missing_run_provenance');
  END IF;

  SELECT * INTO _scene FROM public.composer_scenes WHERE id = _scene_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('applied', false, 'verdict', 'scene_not_found');
  END IF;

  IF _scene.active_run_id IS DISTINCT FROM _run_id THEN
    _verdict := 'stale_run';
  ELSIF _scene.plate_generation IS DISTINCT FROM _plate_generation THEN
    _verdict := 'stale_generation';
  END IF;

  IF _verdict IS NOT NULL THEN
    INSERT INTO public.composer_scene_transition_log (
      scene_id, project_id, from_state, to_state, step_index, is_intermediate,
      guard_mode, run_id, generation, write_id, applied, reason,
      source_signature, caller_class, caller_role, auth_uid
    ) VALUES (
      _scene.id, _scene.project_id, _scene.pipeline_state, 'failed', 1, false,
      'run_bound', _run_id, _plate_generation, _write_id, false, _verdict,
      'v2', 'v2', _caller_role, auth.uid()
    );
    RETURN jsonb_build_object(
      'applied', false, 'verdict', _verdict, 'scene_id', _scene.id,
      'run_id', _run_id, 'plate_generation', _plate_generation
    );
  END IF;

  SELECT * INTO _res FROM public.composer_scene_transition_core(
    _scene.id, 'failed'::public.composer_scene_state, 'run_bound',
    _run_id, _plate_generation, NULL, _write_id,
    ARRAY['plate_ready']::public.composer_scene_state[],
    NULL, 'handoff_failed', _error_text, false, false, false, 'v2', 'v2'
  );

  IF NOT _res.applied THEN
    RETURN jsonb_build_object(
      'applied', false,
      'verdict', CASE WHEN _res.reason = 'unexpected_from_state' THEN 'from_state_rejected' ELSE _res.reason END,
      'scene_id', _scene.id, 'run_id', _run_id, 'plate_generation', _plate_generation
    );
  END IF;

  UPDATE public.composer_scenes
  SET lip_sync_status = 'failed',
      twoshot_stage = 'failed',
      updated_at = now()
  WHERE id = _scene.id;

  RETURN jsonb_build_object(
    'applied', true, 'verdict', 'applied', 'scene_id', _scene.id,
    'run_id', _run_id, 'plate_generation', _plate_generation, 'state', _res.state
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.composer_fail_post_plate_handoff(uuid, uuid, integer, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.composer_fail_post_plate_handoff(uuid, uuid, integer, text, text) TO service_role;