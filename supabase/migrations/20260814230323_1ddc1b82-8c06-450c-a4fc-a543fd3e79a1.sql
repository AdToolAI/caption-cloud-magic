DO $smoke$
DECLARE
  _pid uuid := gen_random_uuid();
  _sid uuid := gen_random_uuid();
  _run uuid := gen_random_uuid();
  _other uuid := gen_random_uuid();
  _uid uuid := '8948d3d9-2c5e-4405-9e9c-1624448e7189';
  _res jsonb;
  _rows jsonb := '[]'::jsonb;
  _log jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  BEGIN
    INSERT INTO public.composer_projects (id, user_id, title) VALUES (_pid, _uid, 'v431-g2-3-audit');
    INSERT INTO public.composer_scenes (id, project_id, pipeline_state, active_run_id, plate_generation, clip_status)
    VALUES (_sid, _pid, 'idle', _run, 1, 'pending');

    -- rejected upload write must be audited
    _res := public.composer_finalize_upload_scene(_sid, _other, 1, 'cvc:upload-complete', 'https://example.test/x.mp4');
    SELECT to_jsonb(l) INTO _log FROM public.composer_scene_transition_log l
      WHERE l.scene_id=_sid AND l.reason='stale_run' AND l.write_id='cvc:upload-complete' LIMIT 1;
    _rows := _rows || jsonb_build_array(jsonb_build_object('case','AUDIT_upload_rejected','pass', _log IS NOT NULL,
      'row', jsonb_build_object('write_id',_log->>'write_id','run_id',_log->>'run_id','generation',_log->>'generation','applied',_log->>'applied','reason',_log->>'reason','caller_role',_log->>'caller_role')));

    -- clear_flag_not_allowed must be audited
    UPDATE public.composer_scenes SET pipeline_state='plate_rendering' WHERE id=_sid;
    _res := public.composer_fail_scene_with_mirrors(_sid, _run, 1, 'cta:id_only_dialog_turns_required', 'x', NULL, 'failed', 'failed', NULL, true);
    SELECT to_jsonb(l) INTO _log FROM public.composer_scene_transition_log l
      WHERE l.scene_id=_sid AND l.reason='clear_flag_not_allowed' LIMIT 1;
    _rows := _rows || jsonb_build_array(jsonb_build_object('case','AUDIT_clear_flag_rejected','pass', _log IS NOT NULL,
      'row', jsonb_build_object('write_id',_log->>'write_id','run_id',_log->>'run_id','generation',_log->>'generation','applied',_log->>'applied','reason',_log->>'reason','caller_role',_log->>'caller_role')));

    -- applied upload write must be audited
    UPDATE public.composer_scenes SET pipeline_state='idle' WHERE id=_sid;
    _res := public.composer_finalize_upload_scene(_sid, _run, 1, 'cvc:upload-complete', 'https://example.test/x.mp4');
    SELECT to_jsonb(l) INTO _log FROM public.composer_scene_transition_log l
      WHERE l.scene_id=_sid AND l.write_id='cvc:upload-complete' AND l.applied = true LIMIT 1;
    _rows := _rows || jsonb_build_array(jsonb_build_object('case','AUDIT_upload_applied','pass', _log IS NOT NULL,
      'row', jsonb_build_object('write_id',_log->>'write_id','run_id',_log->>'run_id','generation',_log->>'generation','applied',_log->>'applied','reason',_log->>'reason','caller_role',_log->>'caller_role')));

    RAISE EXCEPTION 'v431_smoke_rollback';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'v431_smoke_rollback' THEN
      _rows := _rows || jsonb_build_array(jsonb_build_object('case','FATAL3','error', SQLERRM));
    END IF;
  END;
  INSERT INTO public.v431_g2_3_smoke (case_id, result)
  SELECT r->>'case', r FROM jsonb_array_elements(_rows) r;
END
$smoke$;