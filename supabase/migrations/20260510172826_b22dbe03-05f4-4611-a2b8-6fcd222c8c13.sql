ALTER TABLE public.composer_scenes
  DROP CONSTRAINT IF EXISTS composer_scenes_engine_override_check;

ALTER TABLE public.composer_scenes
  ADD CONSTRAINT composer_scenes_engine_override_check
  CHECK (engine_override IN ('auto', 'heygen', 'broll', 'sync-polish', 'cinematic-sync'));