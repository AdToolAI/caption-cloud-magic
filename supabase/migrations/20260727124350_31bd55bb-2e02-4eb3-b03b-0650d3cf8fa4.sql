UPDATE composer_scenes
SET clip_status = 'ready', updated_at = now()
WHERE clip_status = 'generating'
  AND twoshot_stage = 'done'
  AND lip_sync_status = 'done'
  AND clip_url IS NOT NULL;