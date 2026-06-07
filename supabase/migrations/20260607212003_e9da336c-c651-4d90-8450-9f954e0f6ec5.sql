ALTER TABLE public.composer_scenes
  ADD COLUMN IF NOT EXISTS scene_action_user TEXT,
  ADD COLUMN IF NOT EXISTS scene_action_en   TEXT;