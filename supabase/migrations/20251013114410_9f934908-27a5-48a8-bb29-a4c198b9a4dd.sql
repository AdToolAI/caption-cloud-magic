-- Brand Kit v2: Erweiterte Datenbank-Struktur

-- 1. Erweitere brand_kits Tabelle mit neuen Feldern
ALTER TABLE public.brand_kits 
  ADD COLUMN IF NOT EXISTS brand_voice jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS version integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS shared_with jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS templates_used jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS last_consistency_check timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS accent_color varchar(7),
  ADD COLUMN IF NOT EXISTS neutrals jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.brand_kits.brand_voice IS 'AI-analyzed brand voice characteristics';
COMMENT ON COLUMN public.brand_kits.version IS 'Version number for brand kit iterations';
COMMENT ON COLUMN public.brand_kits.shared_with IS 'User IDs that have access to this brand kit';

-- 2. Neue Tabelle: Brand Voice Samples
CREATE TABLE IF NOT EXISTS public.brand_voice_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_kit_id uuid NOT NULL REFERENCES public.brand_kits(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sample_text text NOT NULL,
  analyzed_attributes jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.brand_voice_samples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create own voice samples"
  ON public.brand_voice_samples FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own voice samples"
  ON public.brand_voice_samples FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own voice samples"
  ON public.brand_voice_samples FOR DELETE
  USING (auth.uid() = user_id);

-- 3. Neue Tabelle: Brand Consistency History
CREATE TABLE IF NOT EXISTS public.brand_consistency_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_kit_id uuid NOT NULL REFERENCES public.brand_kits(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score integer NOT NULL CHECK (score >= 0 AND score <= 100),
  content_id uuid,
  content_type text NOT NULL,
  feedback jsonb DEFAULT '{}'::jsonb,
  analyzed_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.brand_consistency_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create own consistency history"
  ON public.brand_consistency_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own consistency history"
  ON public.brand_consistency_history FOR SELECT
  USING (auth.uid() = user_id);

-- 4. Indexes für bessere Performance
CREATE INDEX IF NOT EXISTS idx_brand_kits_user_active 
  ON public.brand_kits(user_id, is_active);

CREATE INDEX IF NOT EXISTS idx_voice_samples_brand_kit 
  ON public.brand_voice_samples(brand_kit_id);

CREATE INDEX IF NOT EXISTS idx_consistency_history_brand_kit 
  ON public.brand_consistency_history(brand_kit_id, analyzed_at DESC);

-- 5. Neue Tabelle: Brand Templates (für gespeicherte Templates)
CREATE TABLE IF NOT EXISTS public.brand_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_kit_id uuid NOT NULL REFERENCES public.brand_kits(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_type text NOT NULL,
  template_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  name text NOT NULL,
  thumbnail_url text,
  is_public boolean DEFAULT false,
  usage_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.brand_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create own templates"
  ON public.brand_templates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own or public templates"
  ON public.brand_templates FOR SELECT
  USING (auth.uid() = user_id OR is_public = true);

CREATE POLICY "Users can update own templates"
  ON public.brand_templates FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own templates"
  ON public.brand_templates FOR DELETE
  USING (auth.uid() = user_id);