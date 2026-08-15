CREATE TABLE IF NOT EXISTS public._v431_a2_smoke_results (
  id bigserial PRIMARY KEY,
  step text NOT NULL,
  ok boolean NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE public._v431_a2_smoke_results ENABLE ROW LEVEL SECURITY;

DO $smoke$
DECLARE
  _uid uuid; _pid uuid; _sid uuid; _run uuid; _job uuid;
  _r jsonb; _before jsonb; _after jsonb;
  _s public.composer_scenes%ROWTYPE;
  _j public.composer_pipeline_jobs%ROWTYPE;
  _state text; _variant text; _ord integer := 0;
  _states text[] := ARRAY['plate_rendering','plate_ready','audio_prep','audio_ready'];
  _variants text[] := ARRAY['mirrors_consistent','mirrors_stale'];
  _ts text; _cs text; _compat boolean; _ok boolean;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT user_id INTO _uid FROM public.composer_projects ORDER BY created_at LIMIT 1;
  INSERT INTO public.composer_projects(user_id, title) VALUES (_uid, 'v431-a2-tuple-smoke') RETURNING id INTO _pid;

  FOREACH _variant IN ARRAY _variants LOOP
  FOREACH _state IN ARRAY _states LOOP
    _run := gen_random_uuid();
    _ord := _ord + 1;
    _compat := _state <> 'plate_rendering';

    IF _variant = 'mirrors_consistent' THEN
      _ts := CASE _state WHEN 'audio_prep' THEN 'audio' WHEN 'audio_ready' THEN 'master_clip' ELSE NULL END;
      _cs := CASE _state WHEN 'plate_rendering' THEN 'generating' ELSE 'ready' END;
    ELSE
      _ts := NULL; _cs := 'generating';
    END IF;

    INSERT INTO public.composer_scenes(
      project_id, order_index, active_run_id, plate_generation,
      pipeline_state, pipeline_state_run_id, clip_status, twoshot_stage)
    VALUES (_pid, _ord, _run, 3, _state::public.composer_scene_state, _run, _cs, _ts)
    RETURNING id INTO _sid;

    -- Plan-Punkt 3: erzwungener runless Legacy-Bridge-Write VOR dem RPC.
    UPDATE public.composer_scenes
    SET clip_status = _cs, twoshot_stage = _ts, lip_sync_status = NULL, updated_at = now()
    WHERE id = _sid;
    -- Ausgangs-State nach dem Bridge-Write wiederherstellen (Fixture-Setup, nicht Teil des Prüflings).
    UPDATE public.composer_scenes
    SET pipeline_state = _state::public.composer_scene_state
    WHERE id = _sid AND pipeline_state IS DISTINCT FROM _state::public.composer_scene_state;
    UPDATE public.composer_scenes SET pipeline_state_run_id = _run WHERE id = _sid;

    INSERT INTO public.composer_pipeline_jobs(
      scene_id, run_id, stage, provider, idempotency_key, status, plate_generation, external_job_id)
    VALUES (_sid, _run, 'base_video', 'replicate', 'v431a2-'||gen_random_uuid()::text, 'dispatched', 3, 'pred_a2_'||_ord)
    RETURNING id INTO _job;

    SELECT to_jsonb(s) INTO _before FROM public.composer_scenes s WHERE id = _sid;

    _r := public.composer_finalize_plate_scene(
      _job, 'pred_a2_'||_ord, 'ccw:plate-complete', 'https://x/a2-'||_ord||'.mp4', NULL,
      jsonb_build_object('cinematic_sync', true));

    SELECT to_jsonb(s) INTO _after FROM public.composer_scenes s WHERE id = _sid;
    SELECT * INTO _s FROM public.composer_scenes WHERE id = _sid;
    SELECT * INTO _j FROM public.composer_pipeline_jobs WHERE id = _job;

    IF _compat THEN
      _ok := (_r->>'applied')::boolean
        AND (_r->>'verdict') = 'compatibility_finalize'
        AND (_after->>'pipeline_state')        IS NOT DISTINCT FROM (_before->>'pipeline_state')
        AND (_after->>'pipeline_substate')     IS NOT DISTINCT FROM (_before->>'pipeline_substate')
        AND (_after->>'pipeline_state_at')     IS NOT DISTINCT FROM (_before->>'pipeline_state_at')
        AND (_after->>'pipeline_state_run_id') IS NOT DISTINCT FROM (_before->>'pipeline_state_run_id')
        AND (_after->>'pipeline_state_run_id') = _run::text
        AND _s.base_video_url = 'https://x/a2-'||_ord||'.mp4'
        AND _s.clip_url = 'https://x/a2-'||_ord||'.mp4'
        AND _s.clip_status = 'ready' AND _s.clip_error IS NULL
        AND _s.processed_video_url IS NULL
        AND _j.status = 'succeeded';
    ELSE
      _ok := (_r->>'applied')::boolean
        AND (_r->>'verdict') = 'applied'
        AND (_after->>'pipeline_state_run_id') = _run::text
        AND (_after->>'pipeline_state_at') IS DISTINCT FROM (_before->>'pipeline_state_at')
        AND _s.base_video_url = 'https://x/a2-'||_ord||'.mp4'
        AND _j.status = 'succeeded';
    END IF;

    INSERT INTO public._v431_a2_smoke_results(step, ok, detail) VALUES (
      'tuple:'||_variant||':'||_state,
      _ok,
      jsonb_build_object(
        'verdict', _r->>'verdict',
        'applied', _r->>'applied',
        'compat_expected', _compat,
        'pipeline_state',        jsonb_build_array(_before->>'pipeline_state',        _after->>'pipeline_state'),
        'pipeline_substate',     jsonb_build_array(_before->>'pipeline_substate',     _after->>'pipeline_substate'),
        'pipeline_state_at',     jsonb_build_array(_before->>'pipeline_state_at',     _after->>'pipeline_state_at'),
        'pipeline_state_run_id', jsonb_build_array(_before->>'pipeline_state_run_id', _after->>'pipeline_state_run_id'),
        'active_run_id', _run::text,
        'job_status', _j.status,
        'base_video_url', _s.base_video_url,
        'clip_status', _s.clip_status,
        'processed_video_url', _s.processed_video_url)
    );
  END LOOP;
  END LOOP;

  DELETE FROM public.composer_scene_transition_log WHERE scene_id IN (SELECT id FROM public.composer_scenes WHERE project_id = _pid);
  DELETE FROM public.composer_pipeline_jobs WHERE scene_id IN (SELECT id FROM public.composer_scenes WHERE project_id = _pid);
  DELETE FROM public.composer_scenes WHERE project_id = _pid;
  DELETE FROM public.composer_projects WHERE id = _pid;
END
$smoke$;