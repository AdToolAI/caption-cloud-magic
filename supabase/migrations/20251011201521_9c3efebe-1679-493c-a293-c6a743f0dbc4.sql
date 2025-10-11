-- Create storage bucket for brand logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('brand-logos', 'brand-logos', true);

-- RLS policies for brand-logos bucket
CREATE POLICY "Users can upload own brand logos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'brand-logos' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view own brand logos"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'brand-logos' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete own brand logos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'brand-logos' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Create brand_kits table
CREATE TABLE public.brand_kits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  logo_url TEXT,
  primary_color VARCHAR(7) NOT NULL,
  secondary_color VARCHAR(7),
  color_palette JSONB NOT NULL DEFAULT '{}',
  font_pairing JSONB NOT NULL DEFAULT '{}',
  mood VARCHAR(50),
  keywords JSONB DEFAULT '[]',
  usage_examples JSONB DEFAULT '[]',
  ai_comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.brand_kits ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own brand kits"
ON public.brand_kits FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create own brand kits"
ON public.brand_kits FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own brand kits"
ON public.brand_kits FOR DELETE
USING (auth.uid() = user_id);