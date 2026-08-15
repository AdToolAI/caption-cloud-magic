DO $smoke$
DECLARE
  _uid uuid; _pid uuid; _sid uuid; _run uuid; _job uuid;
  _st text; _col text; _r jsonb; _before jsonb; _after jsonb;
  _logs_before int; _logs_after int; _lastlog record;
  _idx int := 0;
  _allowed text[] := ARRAY['plate_ready','audio_prep','audio_ready'];
  _denied  text[] := ARRAY['lipsync_dispatched','lipsync_running','complete'];
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT user_id INTO _uid FROM public.composer_projects ORDER BY created_at LIMIT 1;
  INSERT INTO public.composer_projects(user_id, title) VALUES (_uid,'g321-s9') RETURNING id INTO _pid;

  FOREACH _st IN ARRAY (_allowed || _denied) LOOP
    _run := gen_random_uuid();
    _idx := _idx + 1;
    INSERT INTO public.composer_scenes(project_id, order_index, active_run_id, plate_generation,
        pipeline_state, engine_override, clip_status, clip_url, base_video_url, processed_video_url,
        lip_sync_status, twoshot_stage, dialog_shots)
    VALUES (_pid, _idx, _run, 11, _st::public.composer_scene_state, 'cinematic-sync', 'ready',
        'https://x/plate.mp4','https://x/plate.mp4', NULL, 'pending','master_clip','{"a":1}'::jsonb)
    RETURNING id INTO _sid;

    INSERT INTO public.composer_pipeline_jobs(scene_id, run_id, stage, provider, idempotency_key, status, plate_generation, external_job_id)
    VALUES (_sid, _run, 'base_video','replicate','s9-'||gen_random_uuid()::text,'succeeded',11,'pred_s9')
    RETURNING id INTO _job;

    SELECT to_jsonb(s) - 'updated_at' INTO _before FROM public.composer_scenes s WHERE id=_sid;
    SELECT count(*) INTO _logs_before FROM public.composer_scene_transition_log WHERE scene_id=_sid;

    _r := public.composer_fail_post_plate_handoff(_sid, _run, 11, 'ccw:handoff_failed', 'handoff_failed: boom');

    SELECT to_jsonb(s) - 'updated_at' INTO _after FROM public.composer_scenes s WHERE id=_sid;
    SELECT count(*) INTO _logs_after FROM public.composer_scene_transition_log WHERE scene_id=_sid;
    SELECT * INTO _lastlog FROM public.composer_scene_transition_log WHERE scene_id=_sid ORDER BY created_at DESC, id DESC LIMIT 1;

    FOREACH _col IN ARRAY ARRAY['base_video_url','clip_url','processed_video_url','clip_status','dialog_shots'] LOOP
      ASSERT (_before -> _col) IS NOT DISTINCT FROM (_after -> _col),
        format('S9 %s: %s mutated (%s -> %s)', _st, _col, _before->_col, _after->_col);
    END LOOP;

    IF _st = ANY(_allowed) THEN
      ASSERT (_r->>'applied')::boolean, format('S9 %s expected applied, got %s', _st, _r);
      ASSERT _after->>'pipeline_state' = 'failed', format('S9 %s state=%s', _st, _after->>'pipeline_state');
      ASSERT _after->>'lip_sync_status' = 'failed' AND _after->>'twoshot_stage' = 'failed', format('S9 %s mirrors', _st);
      ASSERT _logs_after = _logs_before + 1, format('S9 %s audit rows %s->%s', _st, _logs_before, _logs_after);
      ASSERT _lastlog.applied AND _lastlog.write_id='ccw:handoff_failed' AND _lastlog.run_id=_run
             AND _lastlog.generation=11 AND _lastlog.to_state='failed' AND _lastlog.guard_mode='run_bound',
             format('S9 %s audit contract', _st);
    ELSE
      ASSERT coalesce((_r->>'applied')::boolean, false) = false, format('S9 %s expected reject, got %s', _st, _r);
      ASSERT _r->>'verdict' = 'from_state_rejected', format('S9 %s verdict=%s', _st, _r->>'verdict');
      ASSERT _before = _after, format('S9 %s scene mutated on reject', _st);
      ASSERT coalesce(_lastlog.applied, true) = false AND _lastlog.reason IS NOT NULL, format('S9 %s reject audit', _st);
    END IF;

    ASSERT (SELECT status FROM public.composer_pipeline_jobs WHERE id=_job) = 'succeeded', format('S9 %s job touched', _st);
    RAISE NOTICE 'S9 % -> applied=% verdict=% new_audit_rows=%', _st, _r->>'applied', _r->>'verdict', _logs_after - _logs_before;
  END LOOP;

  DELETE FROM public.composer_scene_transition_log WHERE scene_id IN (SELECT id FROM public.composer_scenes WHERE project_id=_pid);
  DELETE FROM public.composer_pipeline_jobs WHERE scene_id IN (SELECT id FROM public.composer_scenes WHERE project_id=_pid);
  DELETE FROM public.composer_scenes WHERE project_id=_pid;
  DELETE FROM public.composer_projects WHERE id=_pid;
  RAISE NOTICE 'S9 H-COMPATIBILITY-MATRIX PASSED';
END
$smoke$;