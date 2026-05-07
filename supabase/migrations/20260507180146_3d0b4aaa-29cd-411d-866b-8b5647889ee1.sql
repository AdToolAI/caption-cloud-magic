ALTER TABLE public.composer_scenes
  ADD COLUMN IF NOT EXISTS lip_sync_with_voiceover BOOLEAN NOT NULL DEFAULT false;