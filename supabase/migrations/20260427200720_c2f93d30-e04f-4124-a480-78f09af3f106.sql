
-- Table: brand_characters
CREATE TABLE public.brand_characters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  reference_image_url TEXT NOT NULL,
  storage_path TEXT,
  visual_identity_json JSONB DEFAULT '{}'::jsonb,
  usage_count INTEGER NOT NULL DEFAULT 0,
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_brand_characters_user ON public.brand_characters(user_id) WHERE archived_at IS NULL;
CREATE INDEX idx_brand_characters_favorite ON public.brand_characters(user_id, is_favorite) WHERE archived_at IS NULL;

ALTER TABLE public.brand_characters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own brand characters"
  ON public.brand_characters FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own brand characters"
  ON public.brand_characters FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own brand characters"
  ON public.brand_characters FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own brand characters"
  ON public.brand_characters FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_brand_characters_updated_at
  BEFORE UPDATE ON public.brand_characters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Table: brand_character_usage
CREATE TABLE public.brand_character_usage (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  character_id UUID NOT NULL REFERENCES public.brand_characters(id) ON DELETE CASCADE,
  generation_id TEXT,
  model_used TEXT,
  module TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_brand_character_usage_user ON public.brand_character_usage(user_id);
CREATE INDEX idx_brand_character_usage_char ON public.brand_character_usage(character_id);

ALTER TABLE public.brand_character_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own character usage"
  ON public.brand_character_usage FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own character usage"
  ON public.brand_character_usage FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own character usage"
  ON public.brand_character_usage FOR DELETE
  USING (auth.uid() = user_id);

-- Storage bucket: brand-characters (private, RLS: user_id as first path segment)
INSERT INTO storage.buckets (id, name, public)
VALUES ('brand-characters', 'brand-characters', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can view their own brand character files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'brand-characters'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can upload their own brand character files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'brand-characters'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update their own brand character files"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'brand-characters'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete their own brand character files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'brand-characters'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
