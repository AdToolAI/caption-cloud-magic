-- Composer HeyGen/Talking-Head route removal — DB cleanup.
-- 1) Any composer_scenes row whose clip_url still points at the legacy
--    talking-head-renders bucket is downgraded to failed so the UI can
--    re-render via the current Cinematic-Sync pipeline.
UPDATE public.composer_scenes
SET
  clip_status = 'failed',
  clip_error = 'legacy_talking_head_route_removed',
  lip_sync_status = NULL,
  twoshot_stage = NULL,
  dialog_shots = NULL,
  lip_sync_source_clip_url = NULL,
  updated_at = now()
WHERE clip_url ILIKE '%/talking-head-renders/%'
  AND clip_status <> 'failed';

-- 2) Any row still carrying the legacy `heygen` engine_override is
--    normalised to `cinematic-sync`.
UPDATE public.composer_scenes
SET
  engine_override = 'cinematic-sync',
  updated_at = now()
WHERE engine_override = 'heygen';