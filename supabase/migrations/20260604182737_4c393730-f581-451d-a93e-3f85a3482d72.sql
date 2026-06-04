UPDATE composer_scenes
SET
  lip_sync_status = NULL,
  lip_sync_applied_at = NULL,
  dialog_shots = NULL,
  clip_url = COALESCE(lip_sync_source_clip_url, clip_url),
  updated_at = now()
WHERE id = '55608377-ba68-4aba-a3ba-b1feec37716d';