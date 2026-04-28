ALTER TABLE public.composer_scenes
ADD COLUMN IF NOT EXISTS with_audio boolean NOT NULL DEFAULT true;