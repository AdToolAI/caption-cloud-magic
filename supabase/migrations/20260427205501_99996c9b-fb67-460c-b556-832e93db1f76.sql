ALTER TABLE public.sora_long_form_scenes
ADD COLUMN IF NOT EXISTS shot_director jsonb NOT NULL DEFAULT '{}'::jsonb;