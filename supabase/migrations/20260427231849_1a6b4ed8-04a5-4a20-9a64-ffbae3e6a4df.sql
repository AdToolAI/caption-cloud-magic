ALTER TABLE public.composer_scenes
  ADD COLUMN IF NOT EXISTS cinematic_preset_slug TEXT;

COMMENT ON COLUMN public.composer_scenes.cinematic_preset_slug IS
  'Slug of a clientside Cinematic Style Preset (CINEMATIC_STYLE_PRESETS). Independent from applied_style_preset_id (UUID FK to motion_studio_style_presets).';