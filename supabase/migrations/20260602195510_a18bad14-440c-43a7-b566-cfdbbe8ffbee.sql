-- v17 Recovery: scene 6936d98e (3 speakers, Samuel/Matthew/Kailee)
-- Shot 0 = ready (good Sync.so output). Shots 1+2 reset to pending,
-- keeping preclip_url so they get re-dispatched on the new preclip+auto path.
UPDATE public.composer_scenes
SET
  lip_sync_status = 'running',
  twoshot_stage = NULL,
  clip_error = NULL,
  lip_sync_applied_at = NULL,
  updated_at = now(),
  dialog_shots = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              dialog_shots,
              '{status}', '"lipsyncing"'::jsonb, true
            ),
            '{refunded}', 'false'::jsonb, true
          ),
          '{error}', 'null'::jsonb, true
        ),
        '{shots,1}',
        (
          (dialog_shots->'shots'->1)
            - 'sync_job_id' - 'output_url' - 'started_at'
            - 'completed_at' - 'error' - 'degraded'
            - 'retry_count' - 'frame_number_override' - 'force_coords'
            - 'trimmed_audio_url'
        ) || jsonb_build_object(
          'status', 'pending',
          'sync_source_kind', 'preclip'
        ),
        true
      ),
      '{shots,2}',
      (
        (dialog_shots->'shots'->2)
          - 'sync_job_id' - 'output_url' - 'started_at'
          - 'completed_at' - 'error' - 'degraded'
          - 'retry_count' - 'frame_number_override' - 'force_coords'
          - 'trimmed_audio_url'
      ) || jsonb_build_object(
        'status', 'pending',
        'sync_source_kind', 'preclip'
      ),
      true
    ),
    '{finished_at}', 'null'::jsonb, true
  )
WHERE id = '6936d98e-efe6-4f44-a4e5-f87a0c30cea8';