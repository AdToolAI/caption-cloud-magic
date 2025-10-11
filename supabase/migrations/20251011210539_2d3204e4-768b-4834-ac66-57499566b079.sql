-- Create ai_posts table for AI-generated social posts
CREATE TABLE public.ai_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  platforms JSONB NOT NULL DEFAULT '[]'::jsonb,
  language TEXT NOT NULL DEFAULT 'en',
  style TEXT NOT NULL DEFAULT 'clean',
  tone TEXT NOT NULL DEFAULT 'friendly',
  brand_kit_id UUID,
  description TEXT NOT NULL,
  image_url TEXT NOT NULL,
  vision_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  headline TEXT,
  caption TEXT,
  hashtags JSONB NOT NULL DEFAULT '[]'::jsonb,
  cta_line TEXT,
  exports_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  has_watermark BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_posts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own posts"
  ON public.ai_posts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own posts"
  ON public.ai_posts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own posts"
  ON public.ai_posts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own posts"
  ON public.ai_posts FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_ai_posts_updated_at
  BEFORE UPDATE ON public.ai_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Add to feature registry
INSERT INTO public.feature_registry (id, category, route, icon, plan, titles_json, description_json, "order", enabled)
VALUES (
  'ai-post-generator',
  'design',
  '/ai-post-generator',
  'ImagePlus',
  'free',
  '{"en": "AI Post Generator", "de": "KI-Post-Generator", "es": "Generador de Publicaciones IA"}'::jsonb,
  '{"en": "Transform images into complete social posts with AI-powered design", "de": "Verwandeln Sie Bilder mit KI-gesteuertem Design in vollständige Social Posts", "es": "Transforma imágenes en publicaciones sociales completas con diseño impulsado por IA"}'::jsonb,
  25,
  true
);

-- Create storage bucket for generated posts
INSERT INTO storage.buckets (id, name, public)
VALUES ('ai-generated-posts', 'ai-generated-posts', true);

-- Storage policies for ai-generated-posts
CREATE POLICY "Users can upload own generated posts"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'ai-generated-posts' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Anyone can view generated posts"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'ai-generated-posts');

CREATE POLICY "Users can update own generated posts"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'ai-generated-posts'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete own generated posts"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'ai-generated-posts'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );