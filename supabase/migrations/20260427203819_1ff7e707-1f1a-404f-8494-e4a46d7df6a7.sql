ALTER TABLE public.composer_scenes
  ADD COLUMN IF NOT EXISTS shot_director jsonb DEFAULT '{}'::jsonb;