-- Create bios_history table
CREATE TABLE public.bios_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  audience TEXT NOT NULL,
  topic TEXT NOT NULL,
  tone TEXT NOT NULL,
  keywords TEXT,
  bios_json JSONB NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create brand_voice table
CREATE TABLE public.brand_voice (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  tone TEXT NOT NULL,
  keywords TEXT,
  tagline TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.bios_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_voice ENABLE ROW LEVEL SECURITY;

-- RLS Policies for bios_history
CREATE POLICY "Users can view own bios history"
  ON public.bios_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own bios history"
  ON public.bios_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own bios history"
  ON public.bios_history FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for brand_voice
CREATE POLICY "Users can view own brand voice"
  ON public.brand_voice FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own brand voice"
  ON public.brand_voice FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own brand voice"
  ON public.brand_voice FOR UPDATE
  USING (auth.uid() = user_id);

-- Trigger for brand_voice updated_at
CREATE TRIGGER update_brand_voice_updated_at
  BEFORE UPDATE ON public.brand_voice
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Add bio-optimizer to feature_registry
INSERT INTO public.feature_registry (id, category, route, titles_json, icon, plan, enabled, "order", description_json)
VALUES (
  'bio-optimizer',
  'optimize',
  '/bio',
  '{"en": "AI Bio Optimizer", "de": "KI Bio-Optimierer", "es": "Optimizador de Bio con IA"}'::jsonb,
  'UserCircle',
  'free',
  true,
  30,
  '{"en": "Create perfect social media bios with AI", "de": "Erstellen Sie perfekte Social-Media-Bios mit KI", "es": "Crea bios perfectas para redes sociales con IA"}'::jsonb
);