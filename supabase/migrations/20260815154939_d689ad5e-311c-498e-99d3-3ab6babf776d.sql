CREATE TABLE IF NOT EXISTS public._v431_sa2_results (
  seq int,
  fixture text,
  before_state text,
  after_state text,
  before_substate text,
  after_substate text,
  before_state_at timestamptz,
  after_state_at timestamptz,
  before_run_id uuid,
  after_run_id uuid,
  before_row jsonb,
  after_row jsonb,
  before_job jsonb,
  after_job jsonb,
  rpc jsonb
);

DELETE FROM public._v431_sa2_results;

DO $sa2$
DECLARE
  _project uuid;
  _scene uuid;
  _job uuid;
  _run uuid;
  _seed timestamptz := now() - interval '3 hours';
  _fixtures text[][] := ARRAY[
    ARRAY['plate_ready','consistent'],
    ARRAY['plate_ready','stale'],
    ARRAY['audio_prep','consistent'],
    ARRAY['audio_prep','stale'],
    ARRAY['audio_ready','consistent'],
    ARRAY['audio_ready','stale'],
    ARRAY['plate_rendering','consistent'],
    ARRAY['plate_rendering','stale'],
    ARRAY['idle','rejected'],
    ARRAY['audio_prep','duplicate']
  ];
  _f text[];
  _state text;
  _variant text;
  _clip_status text;
  _twoshot text;
  _clip_url text;
  _b record;
  _a record;
  _rpc jsonb;
  _i int := 0;
  _created uuid[] := ARRAY[]::uuid[];
BEGIN
  SELECT id INTO _project FROM public.composer_projects ORDER BY created_at DESC LIMIT 1;
  IF _project IS NULL THEN RAISE EXCEPTION 'no project available'; END IF;

  FOREACH _f SLICE 1 IN ARRAY _fixtures LOOP
    _i := _i + 1;
    _state := _f[1];
    _variant := _f[2];
    _run := gen_random_uuid();
    _scene := gen_random_uuid();

    INSERT INTO public.composer_scenes (
      id, project_id, order_index, scene_type, duration_seconds, clip_source, clip_status,
      text_overlay, transition_type, transition_duration, retry_count, cost_euros,
      plate_generation, active_run_id
    ) VALUES (
      _scene, _project, 9000 + _i, 'ai_generated', 5, 'ai', 'pending',
      '{}'::jsonb, 'none', 0, 0, 0, 1, _run
    );
    _created := _created || _scene;

    IF _state = 'plate_rendering' THEN
      _clip_status := 'generating'; _clip_url := NULL;
    ELSE
      _clip_status := 'ready'; _clip_url := 'https://old/plate.mp4';
    END IF;

    IF _variant = 'stale' THEN
      _twoshot := CASE _state WHEN 'plate_ready' THEN 'audio'
                              WHEN 'audio_prep' THEN NULL
                              WHEN 'audio_ready' THEN 'audio'
                              ELSE 'master_clip' END;
    ELSE
      _twoshot := CASE _state WHEN 'audio_prep' THEN 'audio'
                              WHEN 'audio_ready' THEN 'master_clip'
                              ELSE NULL END;
    END IF;

    UPDATE public.composer_scenes
    SET pipeline_state = (CASE WHEN _state = 'idle' THEN 'plate_queued' ELSE _state END)::public.composer_scene_state,
        pipeline_substate = 'sa2_seed',
        pipeline_state_run_id = _run,
        clip_status = _clip_status,
        twoshot_stage = _twoshot,
        clip_url = _clip_url
    WHERE id = _scene;

    UPDATE public.composer_scenes SET pipeline_state_at = _seed WHERE id = _scene;

    _job := gen_random_uuid();
    INSERT INTO public.composer_pipeline_jobs (
      id, scene_id, run_id, stage, idempotency_key, status, plate_generation,
      external_job_id, provider
    ) VALUES (
      _job, _scene, _run, 'base_video', 'sa2-' || _job::text,
      CASE WHEN _variant = 'duplicate' THEN 'succeeded' ELSE 'dispatched' END,
      1, 'ext-' || _i::text, 'replicate'
    );

    SELECT to_jsonb(s) AS row, s.pipeline_state::text AS st, s.pipeline_substate AS sub,
           s.pipeline_state_at AS sat, s.pipeline_state_run_id AS srun
      INTO _b FROM public.composer_scenes s WHERE s.id = _scene;

    _rpc := public.composer_finalize_plate_scene(
      _job, 'ext-' || _i::text, 'ccw:plate-complete', 'https://new/base.mp4', NULL, '{}'::jsonb
    );

    SELECT to_jsonb(s) AS row, s.pipeline_state::text AS st, s.pipeline_substate AS sub,
           s.pipeline_state_at AS sat, s.pipeline_state_run_id AS srun
      INTO _a FROM public.composer_scenes s WHERE s.id = _scene;

    INSERT INTO public._v431_sa2_results VALUES (
      _i, _state || '/' || _variant,
      _b.st, _a.st, _b.sub, _a.sub, _b.sat, _a.sat, _b.srun, _a.srun,
      _b.row, _a.row,
      jsonb_build_object('status', CASE WHEN _variant = 'duplicate' THEN 'succeeded' ELSE 'dispatched' END),
      (SELECT jsonb_build_object('status', j.status, 'delivery', j.callback_delivery_status)
       FROM public.composer_pipeline_jobs j WHERE j.id = _job),
      _rpc
    );
  END LOOP;

  DELETE FROM public.composer_pipeline_jobs WHERE scene_id = ANY(_created);
  DELETE FROM public.composer_scene_transition_log WHERE scene_id = ANY(_created);
  DELETE FROM public.composer_scenes WHERE id = ANY(_created);
END;
$sa2$;