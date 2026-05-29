DO $$
DECLARE
  s record;
  uid uuid;
  cost int;
BEGIN
  FOR s IN
    SELECT id, project_id, dialog_shots
    FROM public.composer_scenes
    WHERE id IN (
      '7755034f-54ca-4a9e-bf5f-d52f72f0b5d6',
      '5b0ff130-d55f-4e89-b991-9362c171abfc'
    )
  LOOP
    SELECT user_id INTO uid FROM public.composer_projects WHERE id = s.project_id;
    cost := COALESCE((s.dialog_shots->>'cost_credits')::int, 0);

    IF uid IS NOT NULL
       AND cost > 0
       AND COALESCE((s.dialog_shots->>'refunded')::boolean, false) = false
    THEN
      UPDATE public.wallets
        SET balance = balance + cost,
            updated_at = now()
        WHERE user_id = uid;
    END IF;

    UPDATE public.composer_scenes
      SET dialog_shots = COALESCE(dialog_shots, '{}'::jsonb)
            || jsonb_build_object(
                 'status', 'failed',
                 'retry_count', 99,
                 'refunded', true,
                 'finished_at', to_jsonb(now()),
                 'error', 'manual_stop_retry_storm_diagnose'
               ),
          lip_sync_status = 'failed',
          twoshot_stage  = 'failed',
          clip_error     = 'manual_stop_retry_storm_diagnose',
          updated_at     = now()
      WHERE id = s.id;
  END LOOP;
END $$;

DELETE FROM public.syncso_inflight_jobs
WHERE scene_id IN (
  '7755034f-54ca-4a9e-bf5f-d52f72f0b5d6',
  '5b0ff130-d55f-4e89-b991-9362c171abfc'
);