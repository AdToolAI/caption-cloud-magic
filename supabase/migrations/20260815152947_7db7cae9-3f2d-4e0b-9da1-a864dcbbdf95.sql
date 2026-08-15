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
  _post_state public.composer_scene_state;
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
  _cinematic := coalesce((_extra ->> 'cinematic_sync')::boolean, false) AND NOT _compat;

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

  -- Compatibility path: the legacy->state bridge re-derives pipeline_state from the legacy
  -- mirrors when the state column itself is not part of the write. Restore the original state
  -- immediately if that happened; no forward or backward move is allowed here.
  IF _compat THEN
    SELECT pipeline_state INTO _post_state FROM public.composer_scenes WHERE id = _scene.id;
    IF _post_state IS DISTINCT FROM _scene.pipeline_state THEN
      UPDATE public.composer_scenes
      SET pipeline_state = _scene.pipeline_state,
          pipeline_state_at = _scene.pipeline_state_at,
          updated_at = now()
      WHERE id = _scene.id;
    END IF;
  END IF;

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

TRUNCATE public._v431_a_smoke_results;

DO $smoke$
DECLARE
  _uid uuid; _pid uuid; _sid uuid; _run uuid; _job uuid;
  _r jsonb; _before jsonb; _after jsonb; _s public.composer_scenes%ROWTYPE;
  _j public.composer_pipeline_jobs%ROWTYPE; _jb jsonb; _ja jsonb;
  _state text; _variant text; _ord integer := 0; _audit jsonb;
  _states text[] := ARRAY['plate_rendering','plate_ready','audio_prep','audio_ready'];
  _rejected text[] := ARRAY['lipsync_dispatched','lipsync_running','complete'];
  _variants text[] := ARRAY['mirrors_consistent','mirrors_stale'];
  _ts text; _lss text; _cs text;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT user_id INTO _uid FROM public.composer_projects ORDER BY created_at LIMIT 1;
  INSERT INTO public.composer_projects(user_id, title) VALUES (_uid, 'v431-a-compat-smoke') RETURNING id INTO _pid;

  FOREACH _variant IN ARRAY _variants LOOP
  FOREACH _state IN ARRAY _states LOOP
    _run := gen_random_uuid();
    _ord := _ord + 1;

    IF _variant = 'mirrors_consistent' THEN
      _ts := CASE _state WHEN 'audio_prep' THEN 'audio' WHEN 'audio_ready' THEN 'master_clip' ELSE NULL END;
      _cs := CASE _state WHEN 'plate_rendering' THEN 'generating' ELSE 'ready' END;
      _lss := NULL;
    ELSE
      _ts := NULL; _cs := 'generating'; _lss := NULL;
    END IF;

    INSERT INTO public.composer_scenes(project_id, order_index, active_run_id, plate_generation, pipeline_state, clip_status, twoshot_stage, lip_sync_status)
    VALUES (_pid, _ord, _run, 3, _state::public.composer_scene_state, _cs, _ts, _lss) RETURNING id INTO _sid;

    INSERT INTO public.composer_pipeline_jobs(scene_id, run_id, stage, provider, idempotency_key, status, plate_generation, external_job_id)
    VALUES (_sid, _run, 'base_video', 'replicate', 'v431a-'||gen_random_uuid()::text, 'dispatched', 3, 'pred_'||_ord)
    RETURNING id INTO _job;

    SELECT to_jsonb(s) INTO _before FROM public.composer_scenes s WHERE id = _sid;
    _r := public.composer_finalize_plate_scene(_job, 'pred_'||_ord, 'ccw:plate-complete', 'https://x/'||_ord||'.mp4', NULL,
          jsonb_build_object('cinematic_sync', true));
    SELECT to_jsonb(s) INTO _after FROM public.composer_scenes s WHERE id = _sid;
    SELECT * INTO _s FROM public.composer_scenes WHERE id = _sid;
    SELECT * INTO _j FROM public.composer_pipeline_jobs WHERE id = _job;
    SELECT to_jsonb(t) INTO _audit FROM public.composer_scene_transition_log t
      WHERE t.scene_id = _sid ORDER BY t.created_at DESC LIMIT 1;

    INSERT INTO public._v431_a_smoke_results(step, ok, detail) VALUES (
      'allowed:'||_variant||':'||_state,
      (_r->>'applied')::boolean
        AND _s.base_video_url = 'https://x/'||_ord||'.mp4'
        AND _s.clip_url = 'https://x/'||_ord||'.mp4'
        AND _s.clip_status = 'ready' AND _s.clip_error IS NULL
        AND _s.processed_video_url IS NULL
        AND _j.status = 'succeeded'
        AND (CASE WHEN _state = 'plate_rendering'
                  THEN (_r->>'verdict') = 'applied' AND (_audit->>'to_state') = 'plate_ready'
                  ELSE (_r->>'verdict') = 'compatibility_finalize'
                       AND (_after->>'pipeline_state') = _state
                       AND (_after->>'pipeline_substate') IS NOT DISTINCT FROM (_before->>'pipeline_substate') END),
      jsonb_build_object(
        'rpc', _r,
        'state_before', _before->>'pipeline_state', 'state_after', _after->>'pipeline_state',
        'substate_before', _before->>'pipeline_substate', 'substate_after', _after->>'pipeline_substate',
        'clip_status', _s.clip_status, 'clip_error', _s.clip_error,
        'twoshot_stage', _s.twoshot_stage, 'lip_sync_status', _s.lip_sync_status,
        'base_video_url', _s.base_video_url, 'clip_url', _s.clip_url,
        'processed_video_url', _s.processed_video_url, 'job_status', _j.status,
        'audit_from', _audit->>'from_state', 'audit_to', _audit->>'to_state',
        'audit_applied', _audit->>'applied', 'audit_reason', _audit->>'reason')
    );

    SELECT to_jsonb(s) INTO _before FROM public.composer_scenes s WHERE id = _sid;
    SELECT to_jsonb(j) INTO _jb FROM public.composer_pipeline_jobs j WHERE id = _job;
    _r := public.composer_finalize_plate_scene(_job, 'pred_'||_ord, 'ccw:plate-complete', 'https://x/DUP.mp4', NULL, '{}'::jsonb);
    SELECT to_jsonb(s) INTO _after FROM public.composer_scenes s WHERE id = _sid;
    SELECT to_jsonb(j) INTO _ja FROM public.composer_pipeline_jobs j WHERE id = _job;
    INSERT INTO public._v431_a_smoke_results(step, ok, detail) VALUES (
      'duplicate:'||_variant||':'||_state,
      _r->>'verdict' = 'duplicate_callback'
        AND (_after - 'updated_at') = (_before - 'updated_at')
        AND (_ja - 'updated_at') = (_jb - 'updated_at'),
      jsonb_build_object('rpc', _r,
        'scene_diff', (SELECT jsonb_object_agg(k, jsonb_build_array(_before->k, _after->k))
                       FROM jsonb_object_keys(_after) k
                       WHERE k <> 'updated_at' AND _before->k IS DISTINCT FROM _after->k),
        'job_diff', (SELECT jsonb_object_agg(k, jsonb_build_array(_jb->k, _ja->k))
                     FROM jsonb_object_keys(_ja) k
                     WHERE k <> 'updated_at' AND _jb->k IS DISTINCT FROM _ja->k))
    );
  END LOOP;
  END LOOP;

  FOREACH _state IN ARRAY _rejected LOOP
    _run := gen_random_uuid();
    _ord := _ord + 1;
    INSERT INTO public.composer_scenes(project_id, order_index, active_run_id, plate_generation, pipeline_state, clip_status, clip_url, base_video_url)
    VALUES (_pid, _ord, _run, 3, 'plate_rendering', 'generating', 'https://old.mp4', 'https://old.mp4') RETURNING id INTO _sid;
    UPDATE public.composer_scenes SET pipeline_state = _state::public.composer_scene_state WHERE id = _sid;

    INSERT INTO public.composer_pipeline_jobs(scene_id, run_id, stage, provider, idempotency_key, status, plate_generation, external_job_id)
    VALUES (_sid, _run, 'base_video', 'replicate', 'v431r-'||gen_random_uuid()::text, 'dispatched', 3, 'pred_r_'||_ord)
    RETURNING id INTO _job;

    SELECT to_jsonb(s) INTO _before FROM public.composer_scenes s WHERE id = _sid;
    SELECT to_jsonb(j) INTO _jb FROM public.composer_pipeline_jobs j WHERE id = _job;
    _r := public.composer_finalize_plate_scene(_job, 'pred_r_'||_ord, 'ccw:plate-complete', 'https://x/new.mp4', NULL,
          jsonb_build_object('cinematic_sync', true));
    SELECT to_jsonb(s) INTO _after FROM public.composer_scenes s WHERE id = _sid;
    SELECT to_jsonb(j) INTO _ja FROM public.composer_pipeline_jobs j WHERE id = _job;
    SELECT to_jsonb(t) INTO _audit FROM public.composer_scene_transition_log t
      WHERE t.scene_id = _sid ORDER BY t.created_at DESC LIMIT 1;

    INSERT INTO public._v431_a_smoke_results(step, ok, detail) VALUES (
      'rejected:'||_state,
      _r->>'verdict' = 'from_state_rejected'
        AND (_after - 'updated_at') = (_before - 'updated_at')
        AND (_ja - 'updated_at') = (_jb - 'updated_at'),
      jsonb_build_object('rpc', _r,
        'scene_diff', (SELECT jsonb_object_agg(k, jsonb_build_array(_before->k, _after->k))
                       FROM jsonb_object_keys(_after) k
                       WHERE k <> 'updated_at' AND _before->k IS DISTINCT FROM _after->k),
        'job_diff', (SELECT jsonb_object_agg(k, jsonb_build_array(_jb->k, _ja->k))
                     FROM jsonb_object_keys(_ja) k
                     WHERE k <> 'updated_at' AND _jb->k IS DISTINCT FROM _ja->k),
        'audit_applied', _audit->>'applied', 'audit_reason', _audit->>'reason',
        'audit_from', _audit->>'from_state', 'audit_to', _audit->>'to_state')
    );
  END LOOP;

  DELETE FROM public.composer_scene_transition_log WHERE scene_id IN (SELECT id FROM public.composer_scenes WHERE project_id = _pid);
  DELETE FROM public.composer_pipeline_jobs WHERE scene_id IN (SELECT id FROM public.composer_scenes WHERE project_id = _pid);
  DELETE FROM public.composer_scenes WHERE project_id = _pid;
  DELETE FROM public.composer_projects WHERE id = _pid;
END
$smoke$;