-- ============================================================
-- Motion Studio Pro – Phase 1: Character & Location Library
-- ============================================================

-- 1. Character Library
CREATE TABLE public.motion_studio_characters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  signature_items text DEFAULT '',
  reference_image_url text,
  reference_image_seed text,
  voice_id text,
  tags text[] DEFAULT '{}',
  usage_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_motion_studio_characters_user_id ON public.motion_studio_characters(user_id);
CREATE INDEX idx_motion_studio_characters_tags ON public.motion_studio_characters USING GIN(tags);

ALTER TABLE public.motion_studio_characters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own characters"
  ON public.motion_studio_characters FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own characters"
  ON public.motion_studio_characters FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own characters"
  ON public.motion_studio_characters FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own characters"
  ON public.motion_studio_characters FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_motion_studio_characters_updated_at
  BEFORE UPDATE ON public.motion_studio_characters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Location Library
CREATE TABLE public.motion_studio_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  reference_image_url text,
  lighting_notes text DEFAULT '',
  tags text[] DEFAULT '{}',
  usage_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_motion_studio_locations_user_id ON public.motion_studio_locations(user_id);
CREATE INDEX idx_motion_studio_locations_tags ON public.motion_studio_locations USING GIN(tags);

ALTER TABLE public.motion_studio_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own locations"
  ON public.motion_studio_locations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own locations"
  ON public.motion_studio_locations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own locations"
  ON public.motion_studio_locations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own locations"
  ON public.motion_studio_locations FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_motion_studio_locations_updated_at
  BEFORE UPDATE ON public.motion_studio_locations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Erweiterung an composer_scenes (Frame-to-Shot Continuity, Mentions, Director Presets)
ALTER TABLE public.composer_scenes
  ADD COLUMN IF NOT EXISTS last_frame_url text,
  ADD COLUMN IF NOT EXISTS continuity_source_scene_id uuid REFERENCES public.composer_scenes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mentioned_character_ids uuid[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS mentioned_location_ids uuid[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS director_modifiers jsonb DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_composer_scenes_continuity_source
  ON public.composer_scenes(continuity_source_scene_id);

-- 4. Storage Bucket für Library-Assets (Charaktere, Locations, Last-Frames)
INSERT INTO storage.buckets (id, name, public)
VALUES ('motion-studio-library', 'motion-studio-library', false)
ON CONFLICT (id) DO NOTHING;

-- RLS Policies: user_id ist erstes Pfad-Segment
CREATE POLICY "Users view own library assets"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'motion-studio-library'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users upload own library assets"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'motion-studio-library'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users update own library assets"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'motion-studio-library'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users delete own library assets"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'motion-studio-library'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );