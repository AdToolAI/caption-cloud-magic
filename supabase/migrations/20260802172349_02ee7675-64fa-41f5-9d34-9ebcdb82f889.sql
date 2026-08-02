ALTER TABLE public.composer_scenes
  ADD COLUMN IF NOT EXISTS audio_selfheal_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.composer_scenes.audio_selfheal_count IS
  'Run-local count of missing audio-plan self-heal attempts; reset to zero on hard reset or valid audio persistence.';