UPDATE composer_scenes
SET
  lip_sync_status = 'running',
  dialog_shots = jsonb_set(
    jsonb_set(
      dialog_shots,
      '{passes}',
      (
        SELECT jsonb_agg(
          CASE
            WHEN (pass->>'idx')::int IN (0, 1) THEN
              (pass
                - 'job_id'
                - 'output_url'
                - 'preclip_url'
                - 'preclip_face_count'
                - 'finished_at'
                - 'last_error'
                - 'last_error_class'
                - 'rehosted'
              )
              || jsonb_build_object(
                'status', 'pending',
                'retry_count', COALESCE((pass->>'retry_count')::int, 0) + 1,
                'retry_variant', 'coords-pro-lp2pro',
                'v127_recovery', jsonb_build_object(
                  'reason', 'reencoded_passthrough_detected_via_ffmpeg_probe',
                  'model', 'lipsync-2-pro'
                )
              )
            ELSE pass
          END
          ORDER BY (pass->>'idx')::int
        )
        FROM jsonb_array_elements(dialog_shots->'passes') pass
      )
    ),
    '{status}',
    '"retrying"'::jsonb
  ) - 'error',
  twoshot_stage = 'v127_lp2pro_recovery_samuel_matthew',
  lip_sync_applied_at = NULL,
  updated_at = NOW()
WHERE id = 'cba18767-be99-454a-95b8-939d6ad6f107';