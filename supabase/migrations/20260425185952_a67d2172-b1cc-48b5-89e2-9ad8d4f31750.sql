-- Block H: Brand Kit Auto-Apply auf Composer Projekte
ALTER TABLE public.composer_projects
  ADD COLUMN IF NOT EXISTS brand_kit_id uuid REFERENCES public.brand_kits(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS brand_kit_auto_sync boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_composer_projects_brand_kit_id
  ON public.composer_projects(brand_kit_id)
  WHERE brand_kit_id IS NOT NULL;

-- Block G: User Audio Library (Favoriten + Uploads für Musik & SFX)
CREATE TABLE IF NOT EXISTS public.user_audio_library (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('music', 'sfx', 'voice')),
  source text NOT NULL CHECK (source IN ('jamendo', 'pixabay_sfx', 'freesound', 'upload', 'ai_suggest')),
  external_id text,
  title text NOT NULL,
  artist text,
  url text NOT NULL,
  preview_url text,
  thumbnail_url text,
  duration_sec numeric,
  bpm integer,
  genre text,
  mood text,
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  is_favorite boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source, external_id, type)
);

CREATE INDEX IF NOT EXISTS idx_user_audio_library_user_type
  ON public.user_audio_library(user_id, type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_audio_library_favorites
  ON public.user_audio_library(user_id, is_favorite)
  WHERE is_favorite = true;

ALTER TABLE public.user_audio_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own audio library"
  ON public.user_audio_library FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert into their own audio library"
  ON public.user_audio_library FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own audio library"
  ON public.user_audio_library FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete from their own audio library"
  ON public.user_audio_library FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_user_audio_library_updated_at
  BEFORE UPDATE ON public.user_audio_library
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();