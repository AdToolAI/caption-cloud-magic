-- Trending Templates: aggregated, anonymized top-performing project structures
CREATE TABLE public.composer_template_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_project_id UUID,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  scene_count INT DEFAULT 0,
  total_duration_sec NUMERIC DEFAULT 0,
  performance_score NUMERIC DEFAULT 0,
  views_count INT DEFAULT 0,
  completion_rate NUMERIC DEFAULT 0,
  shares_count INT DEFAULT 0,
  thumbnail_url TEXT,
  preview_video_url TEXT,
  structure_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  is_public BOOLEAN DEFAULT true,
  is_featured BOOLEAN DEFAULT false,
  use_count INT DEFAULT 0,
  aggregation_window_start TIMESTAMPTZ,
  aggregation_window_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX idx_composer_template_suggestions_score
  ON public.composer_template_suggestions (performance_score DESC)
  WHERE is_public = true;
CREATE INDEX idx_composer_template_suggestions_category
  ON public.composer_template_suggestions (category)
  WHERE is_public = true;
CREATE INDEX idx_composer_template_suggestions_featured
  ON public.composer_template_suggestions (is_featured, performance_score DESC)
  WHERE is_public = true;

-- RLS
ALTER TABLE public.composer_template_suggestions ENABLE ROW LEVEL SECURITY;

-- Public templates readable by any authenticated user
CREATE POLICY "Authenticated users can view public trending templates"
  ON public.composer_template_suggestions
  FOR SELECT
  TO authenticated
  USING (is_public = true);

-- Admins can view all (including private/draft)
CREATE POLICY "Admins can view all trending templates"
  ON public.composer_template_suggestions
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Only admins can manage (insert/update/delete) — service_role bypasses RLS automatically
CREATE POLICY "Admins can manage trending templates"
  ON public.composer_template_suggestions
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- updated_at trigger
CREATE TRIGGER update_composer_template_suggestions_updated_at
  BEFORE UPDATE ON public.composer_template_suggestions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RPC: increment use_count atomically (callable by authenticated users when cloning)
CREATE OR REPLACE FUNCTION public.increment_trending_template_use(p_template_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_count INT;
BEGIN
  UPDATE public.composer_template_suggestions
  SET use_count = use_count + 1,
      updated_at = now()
  WHERE id = p_template_id AND is_public = true
  RETURNING use_count INTO v_new_count;

  RETURN COALESCE(v_new_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_trending_template_use(UUID) TO authenticated;