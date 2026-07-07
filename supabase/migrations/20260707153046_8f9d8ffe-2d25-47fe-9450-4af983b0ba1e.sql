UPDATE public.composer_scenes
SET lip_sync_status = 'failed',
    twoshot_stage = COALESCE(NULLIF(twoshot_stage,''), 'stale_cleanup_v193')
WHERE lip_sync_status IN ('pending','rendering','rendering_preflight','audio_muxing')
  AND updated_at < now() - interval '30 minutes';