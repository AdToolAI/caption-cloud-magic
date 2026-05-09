ALTER TABLE public.composer_scenes
  ADD COLUMN IF NOT EXISTS frame_pick_seconds numeric;

COMMENT ON COLUMN public.composer_scenes.frame_pick_seconds IS
  'Position (in seconds) within the previous scenes clip from which the user picked the still used as this scenes reference image. Enables re-extraction without losing the original pick point.';