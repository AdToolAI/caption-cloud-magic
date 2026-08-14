DO $smoke$
DECLARE
  v_user uuid;
  v_project uuid;
  v_scene uuid;
  v_run_a uuid := gen_random_uuid();
  v_run_b uuid := gen_random_uuid();
  r record;
  n int;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);

  SELECT id INTO v_user FROM auth.users ORDER BY created_at LIMIT 1;
  IF v_user IS NULL THEN RAISE EXCEPTION 'G0 SMOKE: no user available for fixture'; END IF;

  INSERT INTO public.composer_projects (user_id, title) VALUES (v_user, 'G0 SMOKE FIXTURE') RETURNING id INTO v_project;
  INSERT INTO public.composer_scenes (project_id) VALUES (v_project) RETURNING id INTO v_scene;

  ---------------------------------------------------------------- A1 stale run
  UPDATE public.composer_scenes SET pipeline_state='plate_ready', pipeline_substate=NULL,
    active_run_id=v_run_b, plate_generation=1 WHERE id=v_scene;

  SELECT * INTO r FROM public.composer_scene_transition_v2(
    v_scene,'audio_prep'::composer_scene_state,'run_bound',v_run_a,1,NULL,'smoke:a1',NULL,NULL,NULL,NULL,false,false,false);
  IF r.applied OR r.reason <> 'stale_run' THEN
    RAISE EXCEPTION 'G0 SMOKE A1 FAIL: applied=% reason=%', r.applied, r.reason;
  END IF;
  PERFORM 1 FROM public.composer_scenes WHERE id=v_scene AND pipeline_state='plate_ready';
  IF NOT FOUND THEN RAISE EXCEPTION 'G0 SMOKE A1 FAIL: state was written'; END IF;
  SELECT count(*) INTO n FROM public.composer_scene_transition_log
    WHERE scene_id=v_scene AND write_id='smoke:a1' AND applied=false AND reason='stale_run';
  IF n <> 1 THEN RAISE EXCEPTION 'G0 SMOKE A1 FAIL: audit rows=%', n; END IF;

  ------------------------------------------------------- A2a runless allowlist ok
  UPDATE public.composer_scenes SET pipeline_state='plate_ready', active_run_id=NULL, plate_generation=1 WHERE id=v_scene;
  SELECT * INTO r FROM public.composer_scene_transition_v2(
    v_scene,'canceled'::composer_scene_state,'runless',NULL,NULL,'user_cancel_no_active_run',
    'composer-cancel-scene:cancel-no-active-run',NULL,NULL,NULL,NULL,false,false,false);
  IF NOT r.applied OR r.state <> 'canceled' THEN
    RAISE EXCEPTION 'G0 SMOKE A2a FAIL: applied=% state=% reason=%', r.applied, r.state, r.reason;
  END IF;
  PERFORM 1 FROM public.composer_scenes WHERE id=v_scene AND pipeline_state_run_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'G0 SMOKE A2a FAIL: pipeline_state_run_id not NULL for runless'; END IF;

  -------------------------------------------------- A2b legal edge, not allowlisted
  UPDATE public.composer_scenes SET pipeline_state='plate_ready', active_run_id=NULL, plate_generation=1 WHERE id=v_scene;
  PERFORM 1 FROM public.composer_scene_transitions WHERE from_state='plate_ready' AND to_state='audio_prep';
  IF NOT FOUND THEN RAISE EXCEPTION 'G0 SMOKE A2b SETUP: edge plate_ready->audio_prep is not state-machine legal'; END IF;
  SELECT * INTO r FROM public.composer_scene_transition_v2(
    v_scene,'audio_prep'::composer_scene_state,'runless',NULL,NULL,'image_scene_no_run_context',
    'image_scene_no_run_context',NULL,NULL,NULL,NULL,false,false,false);
  IF r.applied OR r.reason <> 'runless_edge_not_allowed' THEN
    RAISE EXCEPTION 'G0 SMOKE A2b FAIL: applied=% reason=%', r.applied, r.reason;
  END IF;

  ----------------------------------------------------------------- A3 gap path
  UPDATE public.composer_scenes SET pipeline_state='plate_ready', active_run_id=v_run_a, plate_generation=1 WHERE id=v_scene;
  SELECT * INTO r FROM public.composer_scene_transition_v2(
    v_scene,'lipsync_running'::composer_scene_state,'run_bound',v_run_a,1,NULL,'smoke:a3',NULL,NULL,NULL,NULL,false,false,false);
  IF NOT r.applied OR r.state <> 'lipsync_running' THEN
    RAISE EXCEPTION 'G0 SMOKE A3 FAIL: applied=% state=% reason=%', r.applied, r.state, r.reason;
  END IF;
  SELECT count(*) INTO n FROM public.composer_scene_transition_log WHERE scene_id=v_scene AND write_id='smoke:a3';
  IF n <> 4 THEN RAISE EXCEPTION 'G0 SMOKE A3 FAIL: audit rows=% (expected 4)', n; END IF;
  SELECT count(*) INTO n FROM public.composer_scene_transition_log WHERE scene_id=v_scene AND write_id='smoke:a3' AND is_intermediate;
  IF n <> 3 THEN RAISE EXCEPTION 'G0 SMOKE A3 FAIL: intermediate rows=% (expected 3)', n; END IF;
  PERFORM 1 FROM public.composer_scenes WHERE id=v_scene AND pipeline_state='lipsync_running' AND pipeline_state_run_id=v_run_a;
  IF NOT FOUND THEN RAISE EXCEPTION 'G0 SMOKE A3 FAIL: final state/run_id wrong'; END IF;

  ------------------------------------------------------------------ A4 recovery
  UPDATE public.composer_scenes SET pipeline_state='lipsync_running', active_run_id=NULL, plate_generation=1 WHERE id=v_scene;
  SELECT * INTO r FROM public.composer_recover_scene(NULL, 1, v_scene, 'failed'::composer_scene_state, 'orphaned_run', 'smoke:a4a');
  IF NOT r.applied OR r.state <> 'failed' THEN
    RAISE EXCEPTION 'G0 SMOKE A4a FAIL: applied=% state=% reason=%', r.applied, r.state, r.reason;
  END IF;
  PERFORM 1 FROM public.composer_scenes WHERE id=v_scene AND pipeline_detail='recovery:orphaned_run' AND pipeline_state_run_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'G0 SMOKE A4a FAIL: recovery detail/run_id not recorded'; END IF;

  UPDATE public.composer_scenes SET pipeline_state='lipsync_running', active_run_id=v_run_b, plate_generation=1 WHERE id=v_scene;
  SELECT * INTO r FROM public.composer_recover_scene(NULL, 1, v_scene, 'failed'::composer_scene_state, 'orphaned_run', 'smoke:a4b');
  IF r.applied OR r.reason <> 'run_reappeared' THEN
    RAISE EXCEPTION 'G0 SMOKE A4b FAIL: applied=% reason=%', r.applied, r.reason;
  END IF;
  PERFORM 1 FROM public.composer_scenes WHERE id=v_scene AND pipeline_state='lipsync_running';
  IF NOT FOUND THEN RAISE EXCEPTION 'G0 SMOKE A4b FAIL: state was written'; END IF;

  ------------------------------------------------------------------- cleanup
  DELETE FROM public.composer_scene_transition_log WHERE scene_id=v_scene;
  DELETE FROM public.composer_scenes WHERE id=v_scene;
  DELETE FROM public.composer_projects WHERE id=v_project;

  RAISE NOTICE 'G0 SMOKE: A1 PASS, A2a PASS, A2b PASS, A3 PASS, A4a PASS, A4b PASS';
END
$smoke$;