-- v48 cleanup: reset broken partial-mux scene + remove cron for deleted legacy functions
-- (Keep clip_url + clip_status — those are the master plate, not the lipsync result.)

UPDATE public.composer_scenes
SET
  lip_sync_status = 'pending',
  lip_sync_applied_at = NULL,
  twoshot_stage = NULL,
  clip_error = NULL,
  dialog_shots = NULL,
  updated_at = now()
WHERE id = '61edb887-10c7-432d-b777-600707bf7d9a';

DELETE FROM public.syncso_inflight_jobs
WHERE scene_id = '61edb887-10c7-432d-b777-600707bf7d9a';

DO $$
DECLARE
  job_name text;
BEGIN
  FOR job_name IN
    SELECT jobname FROM cron.job
    WHERE command ILIKE '%compose-twoshot-lipsync%'
       OR command ILIKE '%poll-twoshot-lipsync%'
       OR command ILIKE '%twoshot-lipsync-watchdog%'
       OR command ILIKE '%compose-lipsync-scene%'
  LOOP
    PERFORM cron.unschedule(job_name);
    RAISE NOTICE 'Unscheduled cron job pointing at deleted edge function: %', job_name;
  END LOOP;
END $$;