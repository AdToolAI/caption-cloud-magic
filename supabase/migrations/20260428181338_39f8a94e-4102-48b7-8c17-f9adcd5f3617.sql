ALTER TABLE public.composer_scenes
  ADD COLUMN IF NOT EXISTS clip_lead_in_trim_seconds NUMERIC NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.composer_scenes.clip_lead_in_trim_seconds IS
  'Seconds to skip at the start of clip_url playback. Used to hide the frozen reference-image opening frame of i2v providers (Hailuo, Kling, Wan, Seedance, Luma, Veo, Sora). Default 0 (stock/upload/ai-image).';