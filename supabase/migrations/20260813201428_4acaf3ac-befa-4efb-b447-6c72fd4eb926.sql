ALTER TABLE public.composer_scenes
  ADD COLUMN IF NOT EXISTS base_video_url text,
  ADD COLUMN IF NOT EXISTS processed_video_url text;

COMMENT ON COLUMN public.composer_scenes.base_video_url IS
  'v430 Step 1 — provider plate output (pre lip-sync). clip_url stays as the compatibility mirror.';
COMMENT ON COLUMN public.composer_scenes.processed_video_url IS
  'v430 Step 1 — finished output after lip-sync mux. Only set when lip_sync_status = applied.';

UPDATE public.composer_scenes
SET base_video_url = COALESCE(lip_sync_source_clip_url, clip_url)
WHERE base_video_url IS NULL
  AND COALESCE(lip_sync_source_clip_url, clip_url) IS NOT NULL;

UPDATE public.composer_scenes
SET processed_video_url = clip_url
WHERE processed_video_url IS NULL
  AND lip_sync_status = 'applied'
  AND clip_url IS NOT NULL;