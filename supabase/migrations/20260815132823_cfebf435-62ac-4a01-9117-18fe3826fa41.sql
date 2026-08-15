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

  -- From-States: die Legacy-Spiegel-Bridge hebt eine fertige Cinematic-Sync-Plate
  -- unmittelbar nach dem Plate-Apply auf audio_prep/audio_ready. Der Handoff-Fehler
  -- tritt daher faktisch nie in plate_ready auf.
  SELECT * INTO _res FROM public.composer_scene_transition_core(
    _scene.id, 'failed'::public.composer_scene_state, 'run_bound',
    _run_id, _plate_generation, NULL, _write_id,
    ARRAY['plate_ready', 'audio_prep', 'audio_ready']::public.composer_scene_state[],
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

DO $smoke$
DECLARE
  _uid uuid; _pid uuid; _sid uuid; _run uuid := gen_random_uuid();
  _run2 uuid := gen_random_uuid(); _job uuid; _job2 uuid;
  _r jsonb; _s public.composer_scenes%ROWTYPE; _j public.composer_pipeline_jobs%ROWTYPE;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  SELECT user_id INTO _uid FROM public.composer_projects ORDER BY created_at LIMIT 1;
  INSERT INTO public.composer_projects(user_id, title) VALUES (_uid, 'g321-smoke') RETURNING id INTO _pid;
  INSERT INTO public.composer_scenes(project_id, order_index, active_run_id, plate_generation, pipeline_state, engine_override, clip_status)
  VALUES (_pid, 0, _run, 7, 'plate_rendering', 'cinematic-sync', 'generating') RETURNING id INTO _sid;

  -- S1 binding_pending
  INSERT INTO public.composer_pipeline_jobs(scene_id, run_id, stage, provider, idempotency_key, status, plate_generation)
  VALUES (_sid, _run, 'base_video', 'replicate', 'g321-'||gen_random_uuid()::text, 'dispatched', 7)
  RETURNING id INTO _job;
  _r := public.composer_finalize_plate_scene(_job, 'pred_1', 'ccw:plate-complete', 'https://x/a.mp4', NULL, '{}'::jsonb);
  ASSERT _r->>'verdict' = 'binding_pending', 'S1 got '||_r::text;

  -- S2 wrong_job
  UPDATE public.composer_pipeline_jobs SET external_job_id = 'pred_1' WHERE id = _job;
  _r := public.composer_finalize_plate_scene(_job, 'pred_OTHER', 'ccw:plate-complete', 'https://x/a.mp4', NULL, '{}'::jsonb);
  ASSERT _r->>'verdict' = 'wrong_job', 'S2 got '||_r::text;

  -- S3 stale_generation
  UPDATE public.composer_scenes SET plate_generation = 8 WHERE id = _sid;
  _r := public.composer_finalize_plate_scene(_job, 'pred_1', 'ccw:plate-complete', 'https://x/a.mp4', NULL, '{}'::jsonb);
  ASSERT _r->>'verdict' = 'stale_generation', 'S3 got '||_r::text;
  UPDATE public.composer_scenes SET plate_generation = 7 WHERE id = _sid;

  -- S4 happy path A (Bridge hebt cinematic-sync danach auf audio_ready)
  _r := public.composer_finalize_plate_scene(_job, 'pred_1', 'ccw:plate-complete', 'https://x/a.mp4', NULL,
        jsonb_build_object('cinematic_sync', true, 'continuity_rendered_source_clip_url', 'https://prev.mp4',
                           'audio_plan_ambient_gate', jsonb_build_object('status','muted')));
  ASSERT (_r->>'applied')::boolean, 'S4 got '||_r::text;
  ASSERT _r->>'state' = 'plate_ready', 'S4 transition state '||_r::text;
  SELECT * INTO _s FROM public.composer_scenes WHERE id = _sid;
  SELECT * INTO _j FROM public.composer_pipeline_jobs WHERE id = _job;
  ASSERT _s.pipeline_state = 'audio_ready', 'S4 bridged state '||_s.pipeline_state::text;
  ASSERT _s.clip_url = 'https://x/a.mp4' AND _s.base_video_url = 'https://x/a.mp4' AND _s.processed_video_url IS NULL, 'S4 outputs';
  ASSERT _s.clip_status = 'ready' AND _s.clip_error IS NULL, 'S4 clip_status';
  ASSERT _s.lip_sync_status = 'pending' AND _s.twoshot_stage = 'master_clip', 'S4 mirrors';
  ASSERT _s.continuity_rendered_source_clip_url = 'https://prev.mp4', 'S4 continuity';
  ASSERT _s.audio_plan -> 'ambientGate' ->> 'status' = 'muted', 'S4 ambient';
  ASSERT _j.status = 'succeeded' AND _j.completed_at IS NOT NULL, 'S4 job';

  -- S5 duplicate_callback
  _r := public.composer_finalize_plate_scene(_job, 'pred_1', 'ccw:plate-complete', 'https://x/b.mp4', NULL, '{}'::jsonb);
  ASSERT _r->>'verdict' = 'duplicate_callback', 'S5 got '||_r::text;
  ASSERT (SELECT clip_url FROM public.composer_scenes WHERE id=_sid) = 'https://x/a.mp4', 'S5 no rollback';

  -- S6 H handoff
  _r := public.composer_fail_post_plate_handoff(_sid, gen_random_uuid(), 7, 'ccw:handoff_failed', 'x');
  ASSERT _r->>'verdict' = 'stale_run', 'S6 stale_run got '||_r::text;
  _r := public.composer_fail_post_plate_handoff(_sid, _run, 7, 'ccw:handoff_failed', 'handoff_failed: boom');
  ASSERT (_r->>'applied')::boolean, 'S6 got '||_r::text;
  SELECT * INTO _s FROM public.composer_scenes WHERE id = _sid;
  ASSERT _s.pipeline_state = 'failed', 'S6 state';
  ASSERT _s.clip_status = 'ready' AND _s.clip_url = 'https://x/a.mp4', 'S6 plate preserved';
  ASSERT _s.lip_sync_status = 'failed' AND _s.twoshot_stage = 'failed', 'S6 mirrors';
  ASSERT (SELECT status FROM public.composer_pipeline_jobs WHERE id=_job) = 'succeeded', 'S6 no job write';

  -- S7 D ccw:failed
  UPDATE public.composer_scenes
    SET active_run_id = _run2, plate_generation = 8, pipeline_state = 'plate_rendering',
        pipeline_substate = NULL, retry_count = 3, dialog_shots = '{"a":1}'::jsonb,
        clip_status = 'generating', clip_url = NULL, base_video_url = NULL,
        lip_sync_status = NULL, twoshot_stage = NULL
    WHERE id = _sid;
  INSERT INTO public.composer_pipeline_jobs(scene_id, run_id, stage, provider, idempotency_key, status, plate_generation, external_job_id)
  VALUES (_sid, _run2, 'base_video', 'replicate', 'g321b-'||gen_random_uuid()::text, 'running', 8, 'pred_2')
  RETURNING id INTO _job2;
  _r := public.composer_fail_callback_scene(_job2, 'pred_2', 'ccw:failed', 'boom_error', NULL);
  ASSERT (_r->>'applied')::boolean, 'S7 got '||_r::text;
  SELECT * INTO _s FROM public.composer_scenes WHERE id = _sid;
  ASSERT _s.pipeline_state = 'failed', 'S7 state';
  ASSERT _s.clip_status = 'failed' AND _s.clip_error = 'boom_error', 'S7 mirrors';
  ASSERT _s.retry_count = 4, 'S7 retry';
  ASSERT _s.dialog_shots IS NULL, 'S7 clear';
  SELECT * INTO _j FROM public.composer_pipeline_jobs WHERE id = _job2;
  ASSERT _j.status = 'failed' AND _j.error_code = 'ccw:failed', 'S7 job';
  _r := public.composer_fail_callback_scene(_job2, 'pred_2', 'ccw:failed', 'boom2', NULL);
  ASSERT _r->>'verdict' = 'attempt_superseded', 'S7 superseded got '||_r::text;

  -- S8 write-id allowlist
  _r := public.composer_fail_callback_scene(_job, 'pred_1', 'stitch:failed', 'x', NULL);
  ASSERT _r->>'verdict' = 'write_id_not_allowed', 'S8 D allowlist';
  _r := public.composer_finalize_plate_scene(_job, 'pred_1', 'sso:applied', 'u', NULL, '{}'::jsonb);
  ASSERT _r->>'verdict' = 'write_id_not_allowed', 'S8 A allowlist';

  -- Cleanup
  DELETE FROM public.composer_scene_transition_log WHERE scene_id = _sid;
  DELETE FROM public.composer_pipeline_jobs WHERE scene_id = _sid;
  DELETE FROM public.composer_scenes WHERE id = _sid;
  DELETE FROM public.composer_projects WHERE id = _pid;

  RAISE NOTICE 'G3.2.1 SMOKES S1-S8 PASSED';
END
$smoke$;