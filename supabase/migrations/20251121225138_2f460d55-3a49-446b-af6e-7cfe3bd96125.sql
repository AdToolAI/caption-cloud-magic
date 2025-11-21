-- Phase 28: Template Analytics & Business Intelligence
-- Migration für Performance Metrics, Conversion Tracking und A/B Testing

-- =====================================================
-- 1. Template Performance Metrics Table
-- =====================================================
CREATE TABLE IF NOT EXISTS public.template_performance_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.content_templates(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  hour INTEGER CHECK (hour IS NULL OR (hour >= 0 AND hour <= 23)),
  
  -- View Metrics
  total_views INTEGER DEFAULT 0 NOT NULL,
  unique_viewers INTEGER DEFAULT 0 NOT NULL,
  avg_view_duration_seconds NUMERIC(10,2) DEFAULT 0,
  
  -- Engagement Metrics
  total_selections INTEGER DEFAULT 0 NOT NULL,
  selection_rate NUMERIC(5,2) DEFAULT 0,
  
  -- Conversion Metrics
  projects_created INTEGER DEFAULT 0 NOT NULL,
  projects_published INTEGER DEFAULT 0 NOT NULL,
  conversion_to_create NUMERIC(5,2) DEFAULT 0,
  conversion_to_publish NUMERIC(5,2) DEFAULT 0,
  
  -- Rating Metrics
  ratings_submitted INTEGER DEFAULT 0 NOT NULL,
  avg_rating_in_period NUMERIC(3,2) DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  
  CONSTRAINT template_performance_metrics_unique UNIQUE(template_id, date, hour)
);

-- =====================================================
-- 2. Template Conversion Events Table
-- =====================================================
CREATE TABLE IF NOT EXISTS public.template_conversion_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.content_templates(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  session_id TEXT NOT NULL,
  
  -- Funnel Stages
  viewed_at TIMESTAMPTZ,
  selected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  
  -- Time between stages (in seconds)
  time_to_select INTEGER,
  time_to_create INTEGER,
  time_to_publish INTEGER,
  
  -- Context
  source TEXT CHECK (source IN ('browser', 'dashboard', 'recommended', 'search')),
  platform TEXT[],
  
  created_at_timestamp TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  
  CONSTRAINT template_conversion_events_unique UNIQUE(template_id, user_id, session_id)
);

-- =====================================================
-- 3. A/B Testing Framework Table
-- =====================================================
CREATE TABLE IF NOT EXISTS public.template_ab_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  template_a_id UUID NOT NULL REFERENCES public.content_templates(id) ON DELETE CASCADE,
  template_b_id UUID NOT NULL REFERENCES public.content_templates(id) ON DELETE CASCADE,
  
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  status TEXT DEFAULT 'active' NOT NULL CHECK (status IN ('active', 'paused', 'completed')),
  
  -- Traffic split
  traffic_split_a INTEGER DEFAULT 50 NOT NULL CHECK (traffic_split_a >= 0 AND traffic_split_a <= 100),
  traffic_split_b INTEGER DEFAULT 50 NOT NULL CHECK (traffic_split_b >= 0 AND traffic_split_b <= 100),
  
  -- Results
  winner_template_id UUID REFERENCES public.content_templates(id) ON DELETE SET NULL,
  confidence_level NUMERIC(5,2),
  
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- =====================================================
-- 4. Indexes for Performance
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_perf_metrics_template_date 
  ON public.template_performance_metrics(template_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_perf_metrics_date 
  ON public.template_performance_metrics(date DESC);

CREATE INDEX IF NOT EXISTS idx_perf_metrics_template_hour 
  ON public.template_performance_metrics(template_id, date DESC, hour) 
  WHERE hour IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversion_events_template 
  ON public.template_conversion_events(template_id);

CREATE INDEX IF NOT EXISTS idx_conversion_events_user 
  ON public.template_conversion_events(user_id);

CREATE INDEX IF NOT EXISTS idx_conversion_events_session 
  ON public.template_conversion_events(session_id);

CREATE INDEX IF NOT EXISTS idx_conversion_events_source 
  ON public.template_conversion_events(source) 
  WHERE source IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ab_tests_status 
  ON public.template_ab_tests(status) 
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_ab_tests_templates 
  ON public.template_ab_tests(template_a_id, template_b_id);

-- =====================================================
-- 5. Triggers for updated_at
-- =====================================================
CREATE TRIGGER update_template_performance_metrics_updated_at
  BEFORE UPDATE ON public.template_performance_metrics
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_template_conversion_events_updated_at
  BEFORE UPDATE ON public.template_conversion_events
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_template_ab_tests_updated_at
  BEFORE UPDATE ON public.template_ab_tests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- 6. RLS Policies
-- =====================================================

-- Enable RLS
ALTER TABLE public.template_performance_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_conversion_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_ab_tests ENABLE ROW LEVEL SECURITY;

-- template_performance_metrics policies
CREATE POLICY "Anyone can view template performance metrics"
  ON public.template_performance_metrics
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert template performance metrics"
  ON public.template_performance_metrics
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'owner')
    )
  );

CREATE POLICY "Admins can update template performance metrics"
  ON public.template_performance_metrics
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'owner')
    )
  );

-- template_conversion_events policies
CREATE POLICY "Users can view their own conversion events"
  ON public.template_conversion_events
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all conversion events"
  ON public.template_conversion_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'owner')
    )
  );

CREATE POLICY "Anyone can insert conversion events"
  ON public.template_conversion_events
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own conversion events"
  ON public.template_conversion_events
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

-- template_ab_tests policies
CREATE POLICY "Anyone can view active AB tests"
  ON public.template_ab_tests
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage AB tests"
  ON public.template_ab_tests
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'owner')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'owner')
    )
  );

-- =====================================================
-- 7. Helper Function: Calculate Conversion Rates
-- =====================================================
CREATE OR REPLACE FUNCTION public.calculate_template_conversion_rates(
  p_template_id UUID,
  p_date_from DATE,
  p_date_to DATE
)
RETURNS TABLE (
  total_views BIGINT,
  total_selections BIGINT,
  total_creates BIGINT,
  total_publishes BIGINT,
  selection_rate NUMERIC,
  create_rate NUMERIC,
  publish_rate NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH conversion_stats AS (
    SELECT
      COUNT(*) FILTER (WHERE viewed_at IS NOT NULL) as views,
      COUNT(*) FILTER (WHERE selected_at IS NOT NULL) as selections,
      COUNT(*) FILTER (WHERE created_at IS NOT NULL) as creates,
      COUNT(*) FILTER (WHERE published_at IS NOT NULL) as publishes
    FROM public.template_conversion_events
    WHERE template_id = p_template_id
      AND created_at_timestamp >= p_date_from::TIMESTAMPTZ
      AND created_at_timestamp < (p_date_to + INTERVAL '1 day')::TIMESTAMPTZ
  )
  SELECT
    views,
    selections,
    creates,
    publishes,
    CASE WHEN views > 0 THEN (selections::NUMERIC / views * 100) ELSE 0 END as selection_rate,
    CASE WHEN selections > 0 THEN (creates::NUMERIC / selections * 100) ELSE 0 END as create_rate,
    CASE WHEN creates > 0 THEN (publishes::NUMERIC / creates * 100) ELSE 0 END as publish_rate
  FROM conversion_stats;
END;
$$;

-- =====================================================
-- 8. Helper Function: Get Template Performance Summary
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_template_performance_summary(
  p_template_id UUID,
  p_days INTEGER DEFAULT 7
)
RETURNS TABLE (
  template_id UUID,
  total_views INTEGER,
  total_selections INTEGER,
  total_projects INTEGER,
  total_publishes INTEGER,
  avg_rating NUMERIC,
  total_ratings INTEGER,
  selection_rate NUMERIC,
  conversion_rate NUMERIC,
  publish_rate NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH metrics AS (
    SELECT
      SUM(total_views) as views,
      SUM(total_selections) as selections,
      SUM(projects_created) as creates,
      SUM(projects_published) as publishes,
      AVG(avg_rating_in_period) as avg_rating,
      SUM(ratings_submitted) as ratings
    FROM public.template_performance_metrics
    WHERE template_performance_metrics.template_id = p_template_id
      AND date >= CURRENT_DATE - (p_days || ' days')::INTERVAL
  )
  SELECT
    p_template_id,
    COALESCE(views, 0)::INTEGER,
    COALESCE(selections, 0)::INTEGER,
    COALESCE(creates, 0)::INTEGER,
    COALESCE(publishes, 0)::INTEGER,
    COALESCE(avg_rating, 0)::NUMERIC(3,2),
    COALESCE(ratings, 0)::INTEGER,
    CASE WHEN views > 0 THEN (selections::NUMERIC / views * 100) ELSE 0 END as sel_rate,
    CASE WHEN selections > 0 THEN (creates::NUMERIC / selections * 100) ELSE 0 END as conv_rate,
    CASE WHEN creates > 0 THEN (publishes::NUMERIC / creates * 100) ELSE 0 END as pub_rate
  FROM metrics;
END;
$$;