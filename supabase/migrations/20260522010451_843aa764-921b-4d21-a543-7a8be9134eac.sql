UPDATE public.composer_scenes
SET
  dialog_shots = NULL,
  clip_url = COALESCE(lip_sync_source_clip_url, clip_url),
  lip_sync_applied_at = NULL,
  lip_sync_status = 'pending',
  twoshot_stage = 'master_clip',
  clip_error = NULL,
  replicate_prediction_id = NULL,
  updated_at = now()
WHERE id = 'a5b44a04-ffe7-4da9-9048-7bf276d420a7';