CREATE TABLE IF NOT EXISTS public.v431_g2_3_smoke (
  id bigserial PRIMARY KEY,
  case_id text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.v431_g2_3_smoke TO service_role;
GRANT ALL ON SEQUENCE public.v431_g2_3_smoke_id_seq TO service_role;
ALTER TABLE public.v431_g2_3_smoke ENABLE ROW LEVEL SECURITY;

TRUNCATE public.v431_g2_3_smoke;

DO $smoke$
DECLARE
  _pid uuid := gen_random_uuid();
  _sid uuid := gen_random_uuid();
  _run uuid := gen_random_uuid();
  _other uuid := gen_random_uuid();
  _uid uuid := '8948d3d9-2c5e-4405-9e9c-1624448e7189';
  _url text := 'https://example.test/upload-source.mp4';
  _res jsonb;
  _rows jsonb := '[]'::jsonb;
  _before jsonb;
  _after jsonb;
  _log jsonb;

  FUNCTION_PLACEHOLDER boolean;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  BEGIN -- subtransaction, rolled back at the end
    INSERT INTO public.composer_projects (id, user_id, title) VALUES (_pid, _uid, 'v431-g2-3-smoke');
    INSERT INTO public.composer_scenes (id, project_id, pipeline_state, active_run_id, plate_generation)
    VALUES (_sid, _pid, 'idle', _run, 1);

    -- helper snapshots are inline (no nested functions available)

    -- A1 applied
    SELECT to_jsonb(s) - 'created_at' - 'updated_at' INTO _before FROM public.composer_scenes s WHERE id = _sid;
    _res := public.composer_finalize_upload_scene(_sid, _run, 1, 'cvc:upload-complete', _url);
    SELECT jsonb_build_object('state', s.pipeline_state, 'state_run_id', s.pipeline_state_run_id,
      'base', s.base_video_url, 'processed', s.processed_video_url, 'clip', s.clip_url, 'clip_status', s.clip_status)
      INTO _after FROM public.composer_scenes s WHERE id = _sid;
    SELECT to_jsonb(l) INTO _log FROM public.composer_scene_transition_log l WHERE l.scene_id = _sid ORDER BY l.created_at DESC, l.id DESC LIMIT 1;
    _rows := _rows || jsonb_build_array(jsonb_build_object('case','A1_upload_applied','rpc',_res,'after',_after,
      'pass', (_res->>'applied')::boolean AND (_after->>'state_run_id') = _run::text AND (_after->>'base') = _url AND (_after->>'clip') = _url AND (_after->>'clip_status') = 'ready',
      'log', jsonb_build_object('write_id',_log->>'write_id','run_id',_log->>'run_id','generation',_log->>'generation','applied',_log->>'applied','reason',_log->>'reason','caller_role',_log->>'caller_role')));

    -- reset for rejection cases
    UPDATE public.composer_scenes SET pipeline_state='idle', pipeline_state_run_id=NULL,
      base_video_url=_url, processed_video_url=NULL, clip_url=_url, clip_status='ready',
      lip_sync_status='running', twoshot_stage='muxing', lip_sync_source_clip_url='https://example.test/src.mp4',
      dialog_shots='[{"a":1}]'::jsonb, active_run_id=_run, plate_generation=1 WHERE id=_sid;

    -- A2 stale run
    SELECT jsonb_build_object('base',s.base_video_url,'clip',s.clip_url,'clip_status',s.clip_status,'lip',s.lip_sync_status,'ts',s.twoshot_stage,'ds',s.dialog_shots,'state',s.pipeline_state) INTO _before FROM public.composer_scenes s WHERE id=_sid;
    _res := public.composer_finalize_upload_scene(_sid, _other, 1, 'cvc:upload-complete', 'https://example.test/other.mp4');
    SELECT jsonb_build_object('base',s.base_video_url,'clip',s.clip_url,'clip_status',s.clip_status,'lip',s.lip_sync_status,'ts',s.twoshot_stage,'ds',s.dialog_shots,'state',s.pipeline_state) INTO _after FROM public.composer_scenes s WHERE id=_sid;
    SELECT to_jsonb(l) INTO _log FROM public.composer_scene_transition_log l WHERE l.scene_id=_sid ORDER BY l.created_at DESC, l.id DESC LIMIT 1;
    _rows := _rows || jsonb_build_array(jsonb_build_object('case','A2_stale_run','rpc',_res,'unchanged',_before = _after,
      'pass', (_res->>'applied') = 'false' AND (_res->>'reason') = 'stale_run' AND _before = _after,
      'log', jsonb_build_object('write_id',_log->>'write_id','applied',_log->>'applied','reason',_log->>'reason','run_id',_log->>'run_id','generation',_log->>'generation','caller_role',_log->>'caller_role')));

    -- A3 stale generation
    SELECT jsonb_build_object('base',s.base_video_url,'clip',s.clip_url,'clip_status',s.clip_status,'lip',s.lip_sync_status,'ts',s.twoshot_stage,'ds',s.dialog_shots,'state',s.pipeline_state) INTO _before FROM public.composer_scenes s WHERE id=_sid;
    _res := public.composer_finalize_upload_scene(_sid, _run, 99, 'cvc:upload-complete', 'https://example.test/other.mp4');
    SELECT jsonb_build_object('base',s.base_video_url,'clip',s.clip_url,'clip_status',s.clip_status,'lip',s.lip_sync_status,'ts',s.twoshot_stage,'ds',s.dialog_shots,'state',s.pipeline_state) INTO _after FROM public.composer_scenes s WHERE id=_sid;
    _rows := _rows || jsonb_build_array(jsonb_build_object('case','A3_stale_generation','rpc',_res,'pass',
      (_res->>'reason')='stale_generation' AND _before = _after));

    -- A4 wrong from-state
    UPDATE public.composer_scenes SET pipeline_state='complete' WHERE id=_sid;
    SELECT jsonb_build_object('base',s.base_video_url,'clip',s.clip_url,'clip_status',s.clip_status,'lip',s.lip_sync_status,'ts',s.twoshot_stage,'ds',s.dialog_shots,'state',s.pipeline_state) INTO _before FROM public.composer_scenes s WHERE id=_sid;
    _res := public.composer_finalize_upload_scene(_sid, _run, 1, 'cvc:upload-complete', 'https://example.test/other.mp4');
    SELECT jsonb_build_object('base',s.base_video_url,'clip',s.clip_url,'clip_status',s.clip_status,'lip',s.lip_sync_status,'ts',s.twoshot_stage,'ds',s.dialog_shots,'state',s.pipeline_state) INTO _after FROM public.composer_scenes s WHERE id=_sid;
    _rows := _rows || jsonb_build_array(jsonb_build_object('case','A4_wrong_from_state','rpc',_res,'pass',
      (_res->>'reason')='unexpected_state' AND _before = _after));

    -- A5 wrong write_id
    UPDATE public.composer_scenes SET pipeline_state='idle' WHERE id=_sid;
    SELECT jsonb_build_object('base',s.base_video_url,'clip',s.clip_url,'clip_status',s.clip_status,'lip',s.lip_sync_status,'ts',s.twoshot_stage,'ds',s.dialog_shots,'state',s.pipeline_state) INTO _before FROM public.composer_scenes s WHERE id=_sid;
    _res := public.composer_finalize_upload_scene(_sid, _run, 1, 'cvc:something-else', 'https://example.test/other.mp4');
    SELECT jsonb_build_object('base',s.base_video_url,'clip',s.clip_url,'clip_status',s.clip_status,'lip',s.lip_sync_status,'ts',s.twoshot_stage,'ds',s.dialog_shots,'state',s.pipeline_state) INTO _after FROM public.composer_scenes s WHERE id=_sid;
    _rows := _rows || jsonb_build_array(jsonb_build_object('case','A5_wrong_write_id','rpc',_res,'pass',
      (_res->>'reason')='invalid_write_id' AND _before = _after));

    -- A6 source snapshot survives an output clear
    UPDATE public.composer_scenes SET pipeline_state='idle', base_video_url=NULL, clip_url=NULL, processed_video_url=NULL, clip_status=NULL WHERE id=_sid;
    _res := public.composer_finalize_upload_scene(_sid, _run, 1, 'cvc:upload-complete', _url);
    SELECT jsonb_build_object('base',s.base_video_url,'clip',s.clip_url) INTO _after FROM public.composer_scenes s WHERE id=_sid;
    _rows := _rows || jsonb_build_array(jsonb_build_object('case','A6_source_snapshot_after_clear','rpc',_res,'after',_after,'pass',
      (_res->>'applied')='true' AND (_after->>'base')=_url AND (_after->>'clip')=_url));

    -- B1 pika failure applied (cinematic-sync clears lip-sync mirrors)
    UPDATE public.composer_scenes SET pipeline_state='plate_rendering', lip_sync_status='running', twoshot_stage='muxing',
      lip_sync_source_clip_url='https://example.test/src.mp4', dialog_shots='[{"a":1}]'::jsonb, clip_status='generating' WHERE id=_sid;
    _res := public.composer_fail_scene_with_mirrors(_sid, _run, 1, 'cvc:failed/pika', 'Pika 500', NULL, NULL, NULL, 'failed', true);
    SELECT jsonb_build_object('state',s.pipeline_state,'lip',s.lip_sync_status,'ts',s.twoshot_stage,'src',s.lip_sync_source_clip_url,'ds',s.dialog_shots,'clip_status',s.clip_status) INTO _after FROM public.composer_scenes s WHERE id=_sid;
    _rows := _rows || jsonb_build_array(jsonb_build_object('case','B1_pika_applied_clear','rpc',_res,'after',_after,'pass',
      (_res->>'applied')='true' AND (_after->>'state')='failed' AND _after->>'lip' IS NULL AND _after->>'ts' IS NULL AND _after->>'ds' IS NULL AND (_after->>'clip_status')='failed'));

    -- B2 pika stale run rejected
    UPDATE public.composer_scenes SET pipeline_state='plate_rendering', lip_sync_status='running', twoshot_stage='muxing', clip_status='generating' WHERE id=_sid;
    SELECT jsonb_build_object('state',s.pipeline_state,'lip',s.lip_sync_status,'ts',s.twoshot_stage,'ds',s.dialog_shots,'clip_status',s.clip_status,'base',s.base_video_url,'clip',s.clip_url) INTO _before FROM public.composer_scenes s WHERE id=_sid;
    _res := public.composer_fail_scene_with_mirrors(_sid, _other, 1, 'cvc:failed/pika', 'Pika 500', NULL, NULL, NULL, 'failed', true);
    SELECT jsonb_build_object('state',s.pipeline_state,'lip',s.lip_sync_status,'ts',s.twoshot_stage,'ds',s.dialog_shots,'clip_status',s.clip_status,'base',s.base_video_url,'clip',s.clip_url) INTO _after FROM public.composer_scenes s WHERE id=_sid;
    _rows := _rows || jsonb_build_array(jsonb_build_object('case','B2_pika_stale_rejected','rpc',_res,'pass',
      (_res->>'reason')='stale_run' AND _before = _after));

    -- B3 clear flag with foreign write_id rejected
    SELECT jsonb_build_object('state',s.pipeline_state,'lip',s.lip_sync_status,'ts',s.twoshot_stage,'ds',s.dialog_shots,'clip_status',s.clip_status) INTO _before FROM public.composer_scenes s WHERE id=_sid;
    _res := public.composer_fail_scene_with_mirrors(_sid, _run, 1, 'cta:id_only_dialog_turns_required', 'x', NULL, 'failed', 'failed', NULL, true);
    SELECT jsonb_build_object('state',s.pipeline_state,'lip',s.lip_sync_status,'ts',s.twoshot_stage,'ds',s.dialog_shots,'clip_status',s.clip_status) INTO _after FROM public.composer_scenes s WHERE id=_sid;
    SELECT to_jsonb(l) INTO _log FROM public.composer_scene_transition_log l WHERE l.scene_id=_sid ORDER BY l.created_at DESC, l.id DESC LIMIT 1;
    _rows := _rows || jsonb_build_array(jsonb_build_object('case','B3_clear_flag_not_allowed','rpc',_res,'pass',
      (_res->>'reason')='clear_flag_not_allowed' AND _before = _after,
      'log', jsonb_build_object('write_id',_log->>'write_id','applied',_log->>'applied','reason',_log->>'reason','caller_role',_log->>'caller_role')));

    -- C1 cta hard fail applied
    _res := public.composer_fail_scene_with_mirrors(_sid, _run, 1, 'cta:id_only_dialog_turns_required', 'id_only', NULL, 'failed', 'failed', NULL);
    SELECT jsonb_build_object('state',s.pipeline_state,'lip',s.lip_sync_status,'ts',s.twoshot_stage) INTO _after FROM public.composer_scenes s WHERE id=_sid;
    _rows := _rows || jsonb_build_array(jsonb_build_object('case','C1_cta_applied','rpc',_res,'after',_after,'pass',
      (_res->>'applied')='true' AND (_after->>'lip')='failed' AND (_after->>'ts')='failed'));

    -- C2 cta stale rejected
    UPDATE public.composer_scenes SET pipeline_state='plate_rendering', lip_sync_status='running', twoshot_stage='muxing' WHERE id=_sid;
    SELECT jsonb_build_object('state',s.pipeline_state,'lip',s.lip_sync_status,'ts',s.twoshot_stage,'clip_status',s.clip_status) INTO _before FROM public.composer_scenes s WHERE id=_sid;
    _res := public.composer_fail_scene_with_mirrors(_sid, _other, 1, 'cta:id_only_dialog_turns_required', 'id_only', NULL, 'failed', 'failed', NULL);
    SELECT jsonb_build_object('state',s.pipeline_state,'lip',s.lip_sync_status,'ts',s.twoshot_stage,'clip_status',s.clip_status) INTO _after FROM public.composer_scenes s WHERE id=_sid;
    _rows := _rows || jsonb_build_array(jsonb_build_object('case','C2_cta_stale_rejected','rpc',_res,'pass',
      (_res->>'reason')='stale_run' AND _before = _after));

    -- D overload uniqueness
    _rows := _rows || jsonb_build_array(jsonb_build_object('case','D_single_signature','pass',
      (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='composer_fail_scene_with_mirrors') = 1,
      'old_sig_present', to_regprocedure('public.composer_fail_scene_with_mirrors(uuid,uuid,integer,text,text,text,text,text,text)') IS NOT NULL));

    RAISE EXCEPTION 'v431_smoke_rollback';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'v431_smoke_rollback' THEN
      _rows := _rows || jsonb_build_array(jsonb_build_object('case','FATAL','error', SQLERRM));
    END IF;
  END;

  INSERT INTO public.v431_g2_3_smoke (case_id, result)
  SELECT r->>'case', r FROM jsonb_array_elements(_rows) r;
END
$smoke$;