-- Create reel_scripts table for video script generation
CREATE TABLE public.reel_scripts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  platform TEXT NOT NULL,
  tone TEXT NOT NULL,
  duration TEXT NOT NULL DEFAULT 'medium',
  idea TEXT NOT NULL,
  title TEXT,
  brand_kit_id UUID,
  ai_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.reel_scripts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can create own reel scripts"
ON public.reel_scripts
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own reel scripts"
ON public.reel_scripts
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update own reel scripts"
ON public.reel_scripts
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own reel scripts"
ON public.reel_scripts
FOR DELETE
USING (auth.uid() = user_id);

-- Add feature to registry
INSERT INTO public.feature_registry (id, titles_json, description_json, category, route, icon, plan, enabled, "order")
VALUES (
  'reel-script-generator',
  '{"en": "AI Reel Script Generator", "de": "KI-Reel-Skript-Generator", "es": "Generador de guiones IA"}'::jsonb,
  '{"en": "Turn ideas into ready-to-shoot video scripts with scene breakdowns", "de": "Verwandeln Sie Ideen in drehfertige Video-Skripte mit Szenenaufschlüsselung", "es": "Convierte ideas en guiones de video listos para grabar con desglose de escenas"}'::jsonb,
  'create',
  '/reel-script-generator',
  'Video',
  'free',
  true,
  25
);

-- Add trigger for updated_at
CREATE TRIGGER update_reel_scripts_updated_at
BEFORE UPDATE ON public.reel_scripts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();