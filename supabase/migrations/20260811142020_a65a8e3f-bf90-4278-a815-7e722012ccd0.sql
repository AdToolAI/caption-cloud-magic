ALTER TABLE public.composer_scenes
  ADD COLUMN IF NOT EXISTS audio_source text,
  ADD COLUMN IF NOT EXISTS sound_design text,
  ADD COLUMN IF NOT EXISTS camera_choreography_en text;