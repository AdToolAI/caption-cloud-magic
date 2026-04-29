-- Brief: performance loop toggle + last run
ALTER TABLE public.autopilot_briefs
  ADD COLUMN IF NOT EXISTS performance_loop_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_performance_analysis_at timestamptz;

-- Insights table (one row per brief, overwritten on each analysis run)
CREATE TABLE IF NOT EXISTS public.autopilot_performance_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brief_id uuid NOT NULL REFERENCES public.autopilot_briefs(id) ON DELETE CASCADE UNIQUE,
  total_posts_analyzed integer NOT NULL DEFAULT 0,
  avg_engagement_rate double precision,
  -- Ranked arrays of strings (best to worst)
  top_pillars jsonb NOT NULL DEFAULT '[]'::jsonb,
  weakest_pillars jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- [{platform, avg_engagement, posts_count}]
  top_platforms jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- {instagram: [{hour: 18, score: 4.2}, ...], tiktok: [...]}
  top_post_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- [{format, avg_engagement, posts_count}]
  top_formats jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendation_text text,
  analyzed_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_autopilot_performance_insights_user
  ON public.autopilot_performance_insights (user_id);

ALTER TABLE public.autopilot_performance_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own performance insights"
  ON public.autopilot_performance_insights FOR SELECT
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_autopilot_performance_insights_updated_at
  BEFORE UPDATE ON public.autopilot_performance_insights
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();