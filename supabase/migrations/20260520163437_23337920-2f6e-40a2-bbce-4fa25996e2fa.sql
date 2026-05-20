
UPDATE public.composer_scenes
SET
  lip_sync_status = NULL,
  twoshot_stage = 'master_clip',
  clip_error = NULL,
  replicate_prediction_id = NULL,
  audio_plan = jsonb_set(
    audio_plan::jsonb,
    '{twoshot}',
    (
      (audio_plan->'twoshot')::jsonb
        - 'syncJobs'
        - 'heartbeat'
        - 'lipsyncedAt'
        - 'passes'
        - 'anchor_face_audit'
    ),
    false
  ),
  updated_at = now()
WHERE id IN (
  '2641218f-b9b7-46b5-a56d-2fee61e53389',
  'faf20fee-2b80-4bec-8af8-88c3662b53a7'
);
