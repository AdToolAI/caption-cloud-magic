update public.composer_scenes
set
  dialog_shots = null,
  lip_sync_status = 'pending',
  lip_sync_applied_at = null,
  lip_sync_source_clip_url = null,
  twoshot_stage = null,
  clip_url = null,
  clip_status = 'pending',
  replicate_prediction_id = null,
  clip_error = null,
  updated_at = now()
where id = '632370bc-7b58-466d-87d9-a65b8e163106';