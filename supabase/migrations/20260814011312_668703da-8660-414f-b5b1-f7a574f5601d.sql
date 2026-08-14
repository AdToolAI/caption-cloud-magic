-- v430.0 Hotfix — backfill processed_video_url for completed lip-sync scenes.
-- Strict + idempotent: only rows the state machine reports as complete, that
-- carry both a plate and a distinct muxed clip, and have no processed value yet.
UPDATE public.composer_scenes
SET processed_video_url = clip_url
WHERE lip_sync_status IN ('done', 'applied')
  AND pipeline_state = 'complete'
  AND clip_url IS NOT NULL
  AND base_video_url IS NOT NULL
  AND clip_url IS DISTINCT FROM base_video_url
  AND processed_video_url IS NULL;