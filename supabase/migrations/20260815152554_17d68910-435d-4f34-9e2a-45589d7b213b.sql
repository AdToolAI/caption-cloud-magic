CREATE OR REPLACE FUNCTION public.composer_finalize_plate_scene(
  _pipeline_job_id uuid,
  _external_job_id text,
  _write_id text,
  _base_url text,
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
  _compat boolean := false;
  _result_state text;
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
  ELSIF _base_url IS NULL OR length(btrim(_base_url)) = 0 THEN
    _verdict := 'base_url_required';
  ELSIF _scene.pipeline_state NOT IN (
    'plate_rendering'::public.composer_scene_state,
    'plate_ready'::public.composer_scene_state,
    'audio_prep'::public.composer_scene_state,
    'audio_ready'::public.composer_scene_state
  ) THEN
    _verdict := 'from_state_rejected';
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

  IF _scene.pipeline_state = 'plate_rendering'::public.composer_scene_state THEN
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
    _result_state := _res.state::text;
  ELSE
    -- Temporary compatibility path: the active legacy -> state bridge may pre-advance the scene
    -- to audio_prep/audio_ready before the plate callback arrives. Outputs are materialized,
    -- pipeline_state / pipeline_substate stay untouched (no backward transition).
    _compat := true;
    _result_state := _scene.pipeline_state::text;

    INSERT INTO public.composer_scene_transition_log (
      scene_id, project_id, from_state, to_state, step_index, is_intermediate,
      guard_mode, run_id, generation, write_id, applied, reason,
      source_signature, caller_class, caller_role, auth_uid
    ) VALUES (
      _scene.id, _scene.project_id, _scene.pipeline_state, _scene.pipeline_state, 1, false,
      'run_bound', _job.run_id, _job.plate_generation, _write_id, true, 'compatibility_finalize',
      'v2', 'v2', _caller_role, auth.uid()
    );
  END IF;

  _continuity := nullif(btrim(coalesce(_extra ->> 'continuity_rendered_source_clip_url', '')), '');
  _ambient := CASE WHEN jsonb_typeof(_extra -> 'audio_plan_ambient_gate') = 'object'
                   THEN _extra -> 'audio_plan_ambient_gate' ELSE NULL END;
  _cinematic := coalesce((_extra ->> 'cinematic_sync')::boolean, false);

  UPDATE public.composer_scenes
  SET base_video_url = _base_url,
      processed_video_url = NULL,
      clip_url = _base_url,
      clip_status = 'ready',
      clip_error = NULL,
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
    'applied', true,
    'verdict', CASE WHEN _compat THEN 'compatibility_finalize' ELSE 'applied' END,
    'scene_id', _scene.id,
    'run_id', _job.run_id, 'plate_generation', _job.plate_generation,
    'stage', _job.stage, 'job_status', 'succeeded', 'state', _result_state
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.composer_finalize_plate_scene(uuid, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.composer_finalize_plate_scene(uuid, text, text, text, text, jsonb) TO service_role;