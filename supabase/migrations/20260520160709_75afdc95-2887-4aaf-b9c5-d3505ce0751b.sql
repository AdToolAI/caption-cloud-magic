UPDATE public.composer_scenes
SET 
  lip_sync_status = NULL,
  lip_sync_applied_at = NULL,
  twoshot_stage = 'master_clip',
  clip_error = NULL,
  replicate_prediction_id = NULL,
  audio_plan = jsonb_set(
    COALESCE(audio_plan, '{}'::jsonb),
    '{twoshot}',
    (
      COALESCE(audio_plan->'twoshot', '{}'::jsonb)
      - 'syncJobs'
      - 'heartbeat'
      - 'anchor_face_audit'
      - 'lipsyncedAt'
      - 'passes'
    )
  ),
  updated_at = now()
WHERE id = 'faf20fee-2b80-4bec-8af8-88c3662b53a7';