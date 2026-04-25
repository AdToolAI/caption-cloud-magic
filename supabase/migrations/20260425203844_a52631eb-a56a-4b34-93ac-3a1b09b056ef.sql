ALTER TABLE public.composer_scenes
  ADD COLUMN IF NOT EXISTS prompt_slot_order TEXT[];