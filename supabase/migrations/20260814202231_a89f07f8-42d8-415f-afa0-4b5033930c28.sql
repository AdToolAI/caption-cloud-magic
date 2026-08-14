DO $smoke$
DECLARE
  v_user uuid; v_project uuid; v_scene uuid;
  v_run_a uuid := gen_random_uuid();
  v_run_b uuid := gen_random_uuid();
  r record; n int; v_err text;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);

  SELECT id INTO v_user FROM auth.users ORDER BY created_at LIMIT 1;
  IF v_user IS NULL THEN RAISE EXCEPTION 'G1 SMOKE: no user available'; END IF;

  INSERT INTO public.composer_projects (user_id, title) VALUES (v_user, 'G1 SMOKE FIXTURE') RETURNING id INTO v_project;
  INSERT INTO public.composer_scenes (project_id) VALUES (v_project) RETURNING id INTO v_scene;

  -- B1: run-stamped contract failure applies atomically (state + clip_error)
  UPDATE public.composer_scenes SET pipeline_state='plate_queued', active_run_id=v_run_a, plate_generation=3, clip_error=NULL WHERE id=v_scene;
  SELECT * INTO r FROM public.composer_scene_transition_v2(
    v_scene,'failed'::composer_scene_state,'run_bound',v_run_a,3,NULL,
    'compose-video-clips:contract-failure-lipsync-uncertified',NULL,'contract violation',NULL,'contract violation',false,false,false);
  IF NOT r.applied OR r.state <> 'failed' THEN
    RAISE EXCEPTION 'G1 SMOKE B1 FAIL: applied=% state=% reason=%', r.applied, r.state, r.reason;
  END IF;
  SELECT clip_error INTO v_err FROM public.composer_scenes WHERE id=v_scene;
  IF v_err IS DISTINCT FROM 'contract violation' THEN RAISE EXCEPTION 'G1 SMOKE B1 FAIL: clip_error=%', v_err; END IF;
  SELECT count(*) INTO n FROM public.composer_scene_transition_log
    WHERE scene_id=v_scene AND write_id='compose-video-clips:contract-failure-lipsync-uncertified' AND applied;
  IF n <> 1 THEN RAISE EXCEPTION 'G1 SMOKE B1 FAIL: audit rows=%', n; END IF;

  -- B2: late failure from an old run must not touch the current run
  UPDATE public.composer_scenes SET pipeline_state='plate_rendering', active_run_id=v_run_b, plate_generation=4, clip_error=NULL WHERE id=v_scene;
  SELECT * INTO r FROM public.composer_scene_transition_v2(
    v_scene,'failed'::composer_scene_state,'run_bound',v_run_a,3,NULL,
    'compose-video-clips:contract-failure-unsupported-source',NULL,'stale',NULL,'stale',false,false,false);
  IF r.applied OR r.reason <> 'stale_run' THEN
    RAISE EXCEPTION 'G1 SMOKE B2 FAIL: applied=% reason=%', r.applied, r.reason;
  END IF;
  PERFORM 1 FROM public.composer_scenes WHERE id=v_scene AND pipeline_state='plate_rendering' AND clip_error IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'G1 SMOKE B2 FAIL: stale run wrote state or error'; END IF;

  -- B3: anchor branch write id also passes on a stamped run
  UPDATE public.composer_scenes SET pipeline_state='plate_rendering', active_run_id=v_run_b, plate_generation=4 WHERE id=v_scene;
  SELECT * INTO r FROM public.composer_scene_transition_v2(
    v_scene,'failed'::composer_scene_state,'run_bound',v_run_b,4,NULL,
    'compose-video-clips:contract-failure-anchor-input-unsupported',NULL,'anchor',NULL,'anchor',false,false,false);
  IF NOT r.applied OR r.state <> 'failed' THEN
    RAISE EXCEPTION 'G1 SMOKE B3 FAIL: applied=% reason=%', r.applied, r.reason;
  END IF;

  -- B4: no new runless rules / grandfather rows were introduced
  SELECT count(*) INTO n FROM public.composer_runless_transition_rules WHERE write_id LIKE 'compose-video-clips:%';
  IF n <> 0 THEN RAISE EXCEPTION 'G1 SMOKE B4 FAIL: runless rules added=%', n; END IF;
  SELECT count(*) INTO n FROM public.composer_transition_grandfather WHERE write_id LIKE 'compose-video-clips:%';
  IF n <> 0 THEN RAISE EXCEPTION 'G1 SMOKE B4 FAIL: grandfather rows added=%', n; END IF;

  -- cleanup
  DELETE FROM public.composer_scene_transition_log WHERE scene_id=v_scene;
  DELETE FROM public.composer_scenes WHERE id=v_scene;
  DELETE FROM public.composer_projects WHERE id=v_project;

  RAISE NOTICE 'G1 SMOKE: B1..B4 PASS';
END
$smoke$;