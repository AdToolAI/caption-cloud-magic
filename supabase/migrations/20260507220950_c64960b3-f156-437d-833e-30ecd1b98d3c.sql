-- ==== BRAND LOCATIONS ====
CREATE TABLE public.brand_locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  reference_image_url TEXT NOT NULL,
  storage_path TEXT,
  visual_identity_json JSONB DEFAULT '{}'::jsonb,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  usage_count INTEGER NOT NULL DEFAULT 0,
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.brand_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own locations"
  ON public.brand_locations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own locations"
  ON public.brand_locations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own locations"
  ON public.brand_locations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own locations"
  ON public.brand_locations FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_brand_locations_user ON public.brand_locations(user_id) WHERE archived_at IS NULL;

CREATE TRIGGER trg_brand_locations_updated_at
  BEFORE UPDATE ON public.brand_locations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ==== STORAGE BUCKET ====
INSERT INTO storage.buckets (id, name, public)
VALUES ('brand-locations', 'brand-locations', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users read own location files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'brand-locations' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users upload own location files"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'brand-locations' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users update own location files"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'brand-locations' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own location files"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'brand-locations' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ==== SCENE STILL FRAMES (Stage 2 cache) ====
CREATE TABLE public.scene_still_frames (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  scene_id TEXT NOT NULL,
  prompt_hash TEXT NOT NULL,
  variants JSONB NOT NULL DEFAULT '[]'::jsonb,
  selected_variant_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scene_id, prompt_hash)
);

ALTER TABLE public.scene_still_frames ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own still frames"
  ON public.scene_still_frames FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_scene_still_frames_scene ON public.scene_still_frames(scene_id);

CREATE TRIGGER trg_scene_still_frames_updated_at
  BEFORE UPDATE ON public.scene_still_frames
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();