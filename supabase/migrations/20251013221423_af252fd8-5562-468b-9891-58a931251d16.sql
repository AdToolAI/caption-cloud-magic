-- ====================================
-- KI-Post-Generator v2 - Datenbank-Schema
-- ====================================

-- 1. Erweiterte post_drafts Tabelle für v2
CREATE TABLE IF NOT EXISTS public.post_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_kit_id UUID REFERENCES public.brand_kits(id) ON DELETE SET NULL,
  
  -- Eingabe-Metadaten
  brief TEXT NOT NULL,
  image_url TEXT,
  platforms JSONB NOT NULL DEFAULT '[]'::jsonb, -- ["instagram", "facebook", "linkedin"]
  languages JSONB NOT NULL DEFAULT '["de"]'::jsonb, -- ["de", "en", "es"]
  style_preset TEXT NOT NULL DEFAULT 'clean', -- clean, bold, editorial
  tone_override TEXT, -- optional überschreiben des Brand-Tons
  cta_input TEXT,
  
  -- Generierungs-Optionen
  options JSONB NOT NULL DEFAULT '{}'::jsonb, -- {localize, brandFidelity, abVariant, altText, utm}
  
  -- KI-Generierte Inhalte
  hooks JSONB NOT NULL DEFAULT '{"A": "", "B": "", "C": ""}'::jsonb,
  caption TEXT NOT NULL,
  caption_b TEXT, -- für A/B-Variante
  hashtags JSONB NOT NULL DEFAULT '{"reach": [], "niche": [], "brand": []}'::jsonb,
  alt_text TEXT,
  
  -- Bild-Assets & Crops
  image_urls JSONB DEFAULT '[]'::jsonb, -- ursprüngliche Bilder
  crops JSONB DEFAULT '{}'::jsonb, -- {square, portrait, story}
  
  -- Scores & Bewertungen
  scores JSONB DEFAULT '{"hook": 0, "cta": 0}'::jsonb,
  compliance JSONB DEFAULT '{"warnings": []}'::jsonb,
  
  -- UTM & Export
  utm JSONB DEFAULT '{}'::jsonb, -- {source, medium, campaign, url}
  exported_at TIMESTAMPTZ,
  export_bundle_url TEXT,
  
  -- Status & Freigabe
  status TEXT NOT NULL DEFAULT 'draft', -- draft, review, approved, scheduled, published
  review_id UUID,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS Policies für post_drafts
ALTER TABLE public.post_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create own drafts"
  ON public.post_drafts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own drafts"
  ON public.post_drafts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own drafts"
  ON public.post_drafts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own drafts"
  ON public.post_drafts FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger für updated_at
CREATE TRIGGER update_post_drafts_updated_at
  BEFORE UPDATE ON public.post_drafts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Bild-Analyse Tabelle
CREATE TABLE IF NOT EXISTS public.image_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID NOT NULL REFERENCES public.post_drafts(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  
  -- Qualitäts-Metriken
  resolution_width INTEGER,
  resolution_height INTEGER,
  quality_score INTEGER, -- 0-100
  brightness_score INTEGER, -- 0-100
  contrast_score INTEGER, -- 0-100
  
  -- Inhalts-Analyse
  has_faces BOOLEAN DEFAULT FALSE,
  text_percentage NUMERIC, -- % Text im Bild
  dominant_colors JSONB DEFAULT '[]'::jsonb,
  brand_color_match BOOLEAN DEFAULT FALSE,
  
  -- AI-generierte Beschreibung
  ai_description TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.image_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own image analysis"
  ON public.image_analysis FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.post_drafts
      WHERE post_drafts.id = image_analysis.draft_id
      AND post_drafts.user_id = auth.uid()
    )
  );

-- 3. Freigabe-Workflow Tabelle
CREATE TABLE IF NOT EXISTS public.content_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID NOT NULL REFERENCES public.post_drafts(id) ON DELETE CASCADE,
  workspace_id UUID, -- optional für Team-Features
  
  -- Review-Status
  status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, rejected, changes_requested
  submitted_by UUID NOT NULL REFERENCES auth.users(id),
  reviewed_by UUID REFERENCES auth.users(id),
  
  -- Feedback
  comments JSONB DEFAULT '[]'::jsonb, -- [{user_id, text, timestamp}]
  rejection_reason TEXT,
  
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.content_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create reviews for own drafts"
  ON public.content_reviews FOR INSERT
  WITH CHECK (auth.uid() = submitted_by);

CREATE POLICY "Users can view reviews for own drafts"
  ON public.content_reviews FOR SELECT
  USING (
    auth.uid() = submitted_by OR 
    auth.uid() = reviewed_by OR
    EXISTS (
      SELECT 1 FROM public.post_drafts
      WHERE post_drafts.id = content_reviews.draft_id
      AND post_drafts.user_id = auth.uid()
    )
  );

CREATE POLICY "Reviewers can update reviews"
  ON public.content_reviews FOR UPDATE
  USING (auth.uid() = reviewed_by);

-- 4. A/B-Test Varianten Tracking
CREATE TABLE IF NOT EXISTS public.ab_test_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID NOT NULL REFERENCES public.post_drafts(id) ON DELETE CASCADE,
  variant_name TEXT NOT NULL, -- 'A', 'B'
  
  -- Varianten-Daten
  hook TEXT NOT NULL,
  caption TEXT NOT NULL,
  hashtag_set TEXT NOT NULL, -- 'reach', 'niche', 'brand'
  
  -- Metriken (nach Veröffentlichung)
  impressions INTEGER DEFAULT 0,
  engagement INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  engagement_rate NUMERIC,
  
  -- Zeitpunkt
  scheduled_for TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ab_test_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage AB variants for own drafts"
  ON public.ab_test_variants FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.post_drafts
      WHERE post_drafts.id = ab_test_variants.draft_id
      AND post_drafts.user_id = auth.uid()
    )
  );

-- 5. Export History
CREATE TABLE IF NOT EXISTS public.export_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  draft_id UUID REFERENCES public.post_drafts(id) ON DELETE SET NULL,
  
  export_type TEXT NOT NULL, -- 'zip', 'pdf', 'json'
  file_url TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.export_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own exports"
  ON public.export_history FOR SELECT
  USING (auth.uid() = user_id);

-- Indizes für Performance
CREATE INDEX idx_post_drafts_user_id ON public.post_drafts(user_id);
CREATE INDEX idx_post_drafts_brand_kit_id ON public.post_drafts(brand_kit_id);
CREATE INDEX idx_post_drafts_status ON public.post_drafts(status);
CREATE INDEX idx_post_drafts_created_at ON public.post_drafts(created_at DESC);
CREATE INDEX idx_image_analysis_draft_id ON public.image_analysis(draft_id);
CREATE INDEX idx_content_reviews_draft_id ON public.content_reviews(draft_id);
CREATE INDEX idx_ab_test_variants_draft_id ON public.ab_test_variants(draft_id);