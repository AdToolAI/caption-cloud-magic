-- v264 backfill — rescue scenes whose async pipeline actually succeeded
-- but where a late race-write flipped clip_status to 'failed' anyway.
-- Criterion: clip_status='failed' AND clip_url present AND lip_sync_status='done'.
UPDATE public.composer_scenes
SET
  clip_status = 'ready',
  clip_error = NULL,
  updated_at = now()
WHERE clip_status = 'failed'
  AND clip_url IS NOT NULL
  AND length(clip_url) > 0
  AND lip_sync_status = 'done';