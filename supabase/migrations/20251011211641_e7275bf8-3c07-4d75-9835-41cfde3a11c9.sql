-- Create background_projects table for AI Background Replacer
CREATE TABLE public.background_projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  brand_kit_id UUID,
  original_image_url TEXT NOT NULL,
  cutout_image_url TEXT,
  theme TEXT NOT NULL,
  lighting TEXT NOT NULL DEFAULT 'natural',
  style_intensity INTEGER NOT NULL DEFAULT 5,
  results_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.background_projects ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own background projects"
  ON public.background_projects FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own background projects"
  ON public.background_projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own background projects"
  ON public.background_projects FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own background projects"
  ON public.background_projects FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_background_projects_updated_at
  BEFORE UPDATE ON public.background_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Add to feature registry
INSERT INTO public.feature_registry (id, category, route, icon, plan, titles_json, description_json, "order", enabled)
VALUES (
  'background-replacer',
  'design',
  '/background-replacer',
  'ImageReplace',
  'free',
  '{"en": "AI Background Replacer", "de": "KI-Hintergrund-Ersteller", "es": "Reemplazador de Fondo IA"}'::jsonb,
  '{"en": "Transform product photos with AI-generated themed backgrounds", "de": "Verwandeln Sie Produktfotos mit KI-generierten thematischen Hintergründen", "es": "Transforma fotos de productos con fondos temáticos generados por IA"}'::jsonb,
  26,
  true
);

-- Create storage bucket for background projects
INSERT INTO storage.buckets (id, name, public)
VALUES ('background-projects', 'background-projects', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Users can upload own background projects"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'background-projects' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Anyone can view background projects"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'background-projects');

CREATE POLICY "Users can update own background projects"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'background-projects'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete own background projects"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'background-projects'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );