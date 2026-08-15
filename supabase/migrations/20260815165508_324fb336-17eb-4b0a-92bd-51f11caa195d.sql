REVOKE ALL ON FUNCTION public.composer_scenes_plate_pointer_pair() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE _sid uuid; _pid uuid; _uid uuid; _job1 uuid; _job2 uuid; _r text; _ok boolean;
BEGIN
  SELECT id INTO _uid FROM auth.users ORDER BY created_at LIMIT 1;
  IF _uid IS NULL THEN RAISE EXCEPTION 'no auth user for smoke'; END IF;

  INSERT INTO public.composer_projects (id, user_id, title)
  VALUES (gen_random_uuid(), _uid, 'g31f-smoke') RETURNING id INTO _pid;

  INSERT INTO public.composer_scenes (id, project_id, order_index, active_run_id, plate_generation, dialog_shots)
  VALUES (gen_random_uuid(), _pid, 0, gen_random_uuid(), 3,
    jsonb_build_object('passes', jsonb_build_array(
      jsonb_build_object('idx',0,'status','pending'),
      jsonb_build_object('idx',1,'status','pending'))))
  RETURNING id INTO _sid;

  INSERT INTO public.composer_pipeline_jobs (id, scene_id, stage, run_id, plate_generation, status, metadata, idempotency_key)
  SELECT gen_random_uuid(), _sid, 'base_video', active_run_id, 3, 'pending', '{}'::jsonb, 'g31f-smoke-plate-' || _sid::text
  FROM public.composer_scenes WHERE id=_sid RETURNING id INTO _job1;

  INSERT INTO public.composer_pipeline_jobs (id, scene_id, stage, run_id, plate_generation, status, metadata, idempotency_key)
  SELECT gen_random_uuid(), _sid, 'sync_segment', active_run_id, 3, 'pending', jsonb_build_object('pass_idx',1), 'g31f-smoke-sync-' || _sid::text
  FROM public.composer_scenes WHERE id=_sid RETURNING id INTO _job2;

  -- S1: Plate-Bindung setzt Provider-ID und Pointer gemeinsam.
  SELECT public.composer_bind_plate_attempt(_job1,'pred_1',_sid,(SELECT active_run_id FROM public.composer_scenes WHERE id=_sid),3) INTO _r;
  IF _r <> 'bound' THEN RAISE EXCEPTION 'S1 failed: %', _r; END IF;
  SELECT plate_pipeline_job_id = _job1 AND replicate_prediction_id='pred_1' INTO _ok FROM public.composer_scenes WHERE id=_sid;
  IF NOT _ok THEN RAISE EXCEPTION 'S1 pair not written'; END IF;

  -- S2: identisches Paar ist ein No-op.
  SELECT public.composer_bind_plate_attempt(_job1,'pred_1',_sid,(SELECT active_run_id FROM public.composer_scenes WHERE id=_sid),3) INTO _r;
  IF _r <> 'noop' THEN RAISE EXCEPTION 'S2 failed: %', _r; END IF;

  -- S3: falsche Generation wird abgewiesen.
  BEGIN
    SELECT public.composer_bind_plate_attempt(_job1,'pred_1',_sid,(SELECT active_run_id FROM public.composer_scenes WHERE id=_sid),9) INTO _r;
    RAISE EXCEPTION 'S3 did not raise';
  EXCEPTION WHEN others THEN
    IF SQLERRM = 'S3 did not raise' THEN RAISE; END IF;
  END;

  -- S4: Reset der Provider-ID nullt den Pointer mit.
  UPDATE public.composer_scenes SET replicate_prediction_id=NULL WHERE id=_sid;
  SELECT plate_pipeline_job_id IS NULL INTO _ok FROM public.composer_scenes WHERE id=_sid;
  IF NOT _ok THEN RAISE EXCEPTION 'S4 pointer survived reset'; END IF;

  -- S5: Einzelschreiber der Provider-ID hinterlässt keinen Pointer.
  UPDATE public.composer_scenes SET replicate_prediction_id='legacy_1' WHERE id=_sid;
  SELECT plate_pipeline_job_id IS NULL INTO _ok FROM public.composer_scenes WHERE id=_sid;
  IF NOT _ok THEN RAISE EXCEPTION 'S5 stale pointer'; END IF;

  -- S6: Pass-Identitätsgate weist falschen Index ab.
  BEGIN
    SELECT public.composer_bind_sync_pass_attempt(_job2,'sync_1',_sid,0) INTO _r;
    RAISE EXCEPTION 'S6 did not raise';
  EXCEPTION WHEN others THEN
    IF SQLERRM = 'S6 did not raise' THEN RAISE; END IF;
  END;
  SELECT external_job_id IS NULL INTO _ok FROM public.composer_pipeline_jobs WHERE id=_job2;
  IF NOT _ok THEN RAISE EXCEPTION 'S6 partial bind'; END IF;

  -- S7: korrekter Pass bindet Paar atomar.
  SELECT public.composer_bind_sync_pass_attempt(_job2,'sync_1',_sid,1) INTO _r;
  IF _r <> 'bound' THEN RAISE EXCEPTION 'S7 failed: %', _r; END IF;
  SELECT (dialog_shots->'passes'->1->>'job_id')='sync_1'
     AND (dialog_shots->'passes'->1->>'pipeline_job_id')=_job2::text INTO _ok
  FROM public.composer_scenes WHERE id=_sid;
  IF NOT _ok THEN RAISE EXCEPTION 'S7 pair not written'; END IF;

  -- S8: halbe Bindung im Slot ist verboten.
  BEGIN
    PERFORM public.update_dialog_pass_slot(_sid, 0, jsonb_build_object('job_id','x'));
    RAISE EXCEPTION 'S8 did not raise';
  EXCEPTION WHEN others THEN
    IF SQLERRM = 'S8 did not raise' THEN RAISE; END IF;
  END;

  -- S9: Reset ist immer paarweise.
  PERFORM public.update_dialog_pass_slot(_sid, 1, jsonb_build_object('job_id', NULL));
  SELECT (dialog_shots->'passes'->1->>'job_id') IS NULL
     AND (dialog_shots->'passes'->1->>'pipeline_job_id') IS NULL INTO _ok
  FROM public.composer_scenes WHERE id=_sid;
  IF NOT _ok THEN RAISE EXCEPTION 'S9 reset not paired'; END IF;

  DELETE FROM public.composer_pipeline_jobs WHERE scene_id=_sid;
  DELETE FROM public.composer_scenes WHERE id=_sid;
  DELETE FROM public.composer_projects WHERE id=_pid;
  RAISE NOTICE 'v431 G3.1f smoke S1-S9 PASS';
END $$;