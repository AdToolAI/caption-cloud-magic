UPDATE public.composer_scenes
SET lip_sync_status = NULL,
    twoshot_stage = NULL,
    clip_error = COALESCE(NULLIF(clip_error, ''), 'auto-reset: clip_failed_with_dangling_lipsync_pending'),
    updated_at = now()
WHERE dialog_mode = true
  AND lip_sync_status = 'pending'
  AND lip_sync_applied_at IS NULL
  AND (clip_url IS NULL OR clip_url = '')
  AND (clip_status IN ('failed', 'pending') OR clip_status IS NULL)
  AND updated_at < now() - interval '5 minutes';