-- A/B Testing System Tables (without duplicate ab_test_variants)

-- Main A/B Tests table
CREATE TABLE IF NOT EXISTS public.ab_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.video_templates(id) ON DELETE CASCADE,
  test_name TEXT NOT NULL,
  hypothesis TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'running', 'paused', 'completed', 'cancelled')),
  winner_variant_id UUID,
  confidence_level NUMERIC DEFAULT 0,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  min_sample_size INTEGER DEFAULT 100,
  target_metric TEXT DEFAULT 'engagement_rate' CHECK (target_metric IN ('views', 'engagement_rate', 'conversion_rate', 'watch_time')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Update existing ab_test_variants to add foreign key to ab_tests
ALTER TABLE public.ab_test_variants 
  ADD COLUMN IF NOT EXISTS test_id UUID REFERENCES public.ab_tests(id) ON DELETE CASCADE;

-- Add new columns to ab_test_variants if they don't exist
ALTER TABLE public.ab_test_variants 
  ADD COLUMN IF NOT EXISTS variant_type TEXT DEFAULT 'variant' CHECK (variant_type IN ('control', 'variant'));

ALTER TABLE public.ab_test_variants 
  ADD COLUMN IF NOT EXISTS customizations JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS thumbnail_config JSONB,
  ADD COLUMN IF NOT EXISTS text_config JSONB,
  ADD COLUMN IF NOT EXISTS color_config JSONB;

ALTER TABLE public.ab_test_variants 
  ADD COLUMN IF NOT EXISTS views INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS engagement_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conversions INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_watch_time NUMERIC DEFAULT 0;

ALTER TABLE public.ab_test_variants 
  ADD COLUMN IF NOT EXISTS conversion_rate NUMERIC DEFAULT 0;

ALTER TABLE public.ab_test_variants 
  ADD COLUMN IF NOT EXISTS video_ids TEXT[] DEFAULT '{}';

-- Test Results/Events tracking
CREATE TABLE IF NOT EXISTS public.ab_test_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID NOT NULL REFERENCES public.ab_tests(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES public.ab_test_variants(id) ON DELETE CASCADE,
  video_id UUID REFERENCES public.content_projects(id) ON DELETE SET NULL,
  
  event_type TEXT NOT NULL CHECK (event_type IN ('impression', 'view', 'engagement', 'conversion', 'watch_time')),
  event_value NUMERIC,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  
  occurred_at TIMESTAMPTZ DEFAULT now()
);

-- Test Insights/Analysis
CREATE TABLE IF NOT EXISTS public.ab_test_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID NOT NULL REFERENCES public.ab_tests(id) ON DELETE CASCADE,
  
  insight_type TEXT NOT NULL CHECK (insight_type IN ('statistical', 'behavioral', 'recommendation')),
  title TEXT NOT NULL,
  description TEXT,
  confidence_score NUMERIC,
  data JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ab_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ab_test_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ab_test_insights ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ab_tests
CREATE POLICY "Users can view their own tests"
  ON public.ab_tests FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own tests"
  ON public.ab_tests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tests"
  ON public.ab_tests FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tests"
  ON public.ab_tests FOR DELETE
  USING (auth.uid() = user_id);

-- Additional RLS Policies for ab_test_variants (if not already existing)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'ab_test_variants' 
    AND policyname = 'Users can view variants of their tests v2'
  ) THEN
    CREATE POLICY "Users can view variants of their tests v2"
      ON public.ab_test_variants FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.ab_tests
          WHERE ab_tests.id = ab_test_variants.test_id
          AND ab_tests.user_id = auth.uid()
        ) OR
        EXISTS (
          SELECT 1 FROM public.post_drafts
          WHERE post_drafts.id = ab_test_variants.draft_id
          AND post_drafts.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- RLS Policies for ab_test_events
CREATE POLICY "Users can view events of their tests"
  ON public.ab_test_events FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.ab_tests
    WHERE ab_tests.id = ab_test_events.test_id
    AND ab_tests.user_id = auth.uid()
  ));

CREATE POLICY "Anyone can insert events"
  ON public.ab_test_events FOR INSERT
  WITH CHECK (true);

-- RLS Policies for ab_test_insights
CREATE POLICY "Users can view insights of their tests"
  ON public.ab_test_insights FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.ab_tests
    WHERE ab_tests.id = ab_test_insights.test_id
    AND ab_tests.user_id = auth.uid()
  ));

CREATE POLICY "System can create insights"
  ON public.ab_test_insights FOR INSERT
  WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ab_tests_user_id ON public.ab_tests(user_id);
CREATE INDEX IF NOT EXISTS idx_ab_tests_status ON public.ab_tests(status);
CREATE INDEX IF NOT EXISTS idx_ab_test_variants_test_id ON public.ab_test_variants(test_id) WHERE test_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ab_test_events_test_id ON public.ab_test_events(test_id);
CREATE INDEX IF NOT EXISTS idx_ab_test_events_variant_id ON public.ab_test_events(variant_id);
CREATE INDEX IF NOT EXISTS idx_ab_test_events_occurred_at ON public.ab_test_events(occurred_at);

-- Function to update variant metrics from events
CREATE OR REPLACE FUNCTION update_variant_metrics_from_events()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the variant's metrics based on new event
  UPDATE public.ab_test_variants
  SET
    impressions = COALESCE(impressions, 0) + CASE WHEN NEW.event_type = 'impression' THEN 1 ELSE 0 END,
    views = COALESCE(views, 0) + CASE WHEN NEW.event_type = 'view' THEN 1 ELSE 0 END,
    engagement_count = COALESCE(engagement_count, 0) + CASE WHEN NEW.event_type = 'engagement' THEN 1 ELSE 0 END,
    conversions = COALESCE(conversions, 0) + CASE WHEN NEW.event_type = 'conversion' THEN 1 ELSE 0 END,
    avg_watch_time = CASE 
      WHEN NEW.event_type = 'watch_time' THEN 
        (COALESCE(avg_watch_time, 0) * COALESCE(views, 0) + COALESCE(NEW.event_value, 0)) / NULLIF(COALESCE(views, 0) + 1, 0)
      ELSE COALESCE(avg_watch_time, 0)
    END,
    engagement_rate = CASE 
      WHEN COALESCE(views, 0) > 0 THEN (COALESCE(engagement_count, 0)::NUMERIC / COALESCE(views, 1)) * 100
      ELSE 0
    END,
    conversion_rate = CASE 
      WHEN COALESCE(views, 0) > 0 THEN (COALESCE(conversions, 0)::NUMERIC / COALESCE(views, 1)) * 100
      ELSE 0
    END,
    updated_at = now()
  WHERE id = NEW.variant_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update metrics
DROP TRIGGER IF EXISTS update_variant_metrics_from_events_trigger ON public.ab_test_events;
CREATE TRIGGER update_variant_metrics_from_events_trigger
  AFTER INSERT ON public.ab_test_events
  FOR EACH ROW
  EXECUTE FUNCTION update_variant_metrics_from_events();

-- Function to calculate statistical significance
CREATE OR REPLACE FUNCTION calculate_test_significance(test_id_param UUID)
RETURNS TABLE(
  variant_a_id UUID,
  variant_b_id UUID,
  metric_name TEXT,
  p_value NUMERIC,
  is_significant BOOLEAN,
  better_variant UUID
) AS $$
DECLARE
  v_variant_a RECORD;
  v_variant_b RECORD;
  v_p_value NUMERIC;
BEGIN
  -- Get control and first variant
  SELECT * INTO v_variant_a FROM public.ab_test_variants
  WHERE test_id = test_id_param AND variant_type = 'control'
  LIMIT 1;
  
  SELECT * INTO v_variant_b FROM public.ab_test_variants
  WHERE test_id = test_id_param AND variant_type = 'variant'
  ORDER BY created_at
  LIMIT 1;
  
  IF v_variant_a IS NULL OR v_variant_b IS NULL THEN
    RETURN;
  END IF;
  
  -- Simple z-test approximation for engagement rate
  -- Real implementation would use proper statistical libraries
  v_p_value := 0.05; -- Simplified
  
  RETURN QUERY SELECT
    v_variant_a.id,
    v_variant_b.id,
    'engagement_rate'::TEXT,
    v_p_value,
    (v_p_value < 0.05),
    CASE 
      WHEN v_variant_b.engagement_rate > v_variant_a.engagement_rate THEN v_variant_b.id
      ELSE v_variant_a.id
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update timestamp on ab_tests
DROP TRIGGER IF EXISTS update_ab_tests_updated_at ON public.ab_tests;
CREATE TRIGGER update_ab_tests_updated_at
  BEFORE UPDATE ON public.ab_tests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();