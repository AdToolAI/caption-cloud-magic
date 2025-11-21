-- Create universal_background_assets table
CREATE TABLE IF NOT EXISTS public.universal_background_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('color', 'gradient', 'video', 'image')),
  title TEXT,
  url TEXT,
  storage_path TEXT,
  color TEXT,
  gradient_colors JSONB,
  duration_sec NUMERIC,
  thumbnail_url TEXT,
  source TEXT DEFAULT 'upload',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.universal_background_assets ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own background assets"
  ON public.universal_background_assets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own background assets"
  ON public.universal_background_assets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own background assets"
  ON public.universal_background_assets FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own background assets"
  ON public.universal_background_assets FOR DELETE
  USING (auth.uid() = user_id);

-- Index
CREATE INDEX idx_background_assets_user_id ON public.universal_background_assets(user_id);
CREATE INDEX idx_background_assets_type ON public.universal_background_assets(type);

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_background_assets_updated_at
  BEFORE UPDATE ON public.universal_background_assets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create storage bucket for background assets
INSERT INTO storage.buckets (id, name, public)
VALUES ('background-assets', 'background-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies
CREATE POLICY "Users can upload own backgrounds"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'background-assets' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Public can view background assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'background-assets');

CREATE POLICY "Users can delete own backgrounds"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'background-assets' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );