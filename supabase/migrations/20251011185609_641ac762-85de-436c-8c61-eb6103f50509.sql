-- Create social_connections table
CREATE TABLE public.social_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('instagram', 'facebook', 'tiktok', 'linkedin', 'x', 'youtube')),
  account_id TEXT NOT NULL,
  account_name TEXT NOT NULL,
  access_token_hash TEXT,
  refresh_token_hash TEXT,
  token_expires_at TIMESTAMPTZ,
  auto_sync_enabled BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, provider, account_id)
);

-- Create post_metrics table
CREATE TABLE public.post_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('instagram', 'facebook', 'tiktok', 'linkedin', 'x', 'youtube')),
  account_id TEXT NOT NULL,
  post_id TEXT NOT NULL,
  post_url TEXT,
  media_type TEXT,
  caption_text TEXT,
  posted_at TIMESTAMPTZ NOT NULL,
  likes INTEGER,
  comments INTEGER,
  shares INTEGER,
  saves INTEGER,
  reach INTEGER,
  impressions INTEGER,
  video_views INTEGER,
  engagement_rate FLOAT,
  imported_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, provider, post_id)
);

-- Create performance_ai_insights table
CREATE TABLE public.performance_ai_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT,
  date_range_start DATE NOT NULL,
  date_range_end DATE NOT NULL,
  summary_json JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.social_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_ai_insights ENABLE ROW LEVEL SECURITY;

-- RLS Policies for social_connections
CREATE POLICY "Users can view own connections"
  ON public.social_connections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own connections"
  ON public.social_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own connections"
  ON public.social_connections FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own connections"
  ON public.social_connections FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for post_metrics
CREATE POLICY "Users can view own metrics"
  ON public.post_metrics FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own metrics"
  ON public.post_metrics FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own metrics"
  ON public.post_metrics FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own metrics"
  ON public.post_metrics FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for performance_ai_insights
CREATE POLICY "Users can view own insights"
  ON public.performance_ai_insights FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own insights"
  ON public.performance_ai_insights FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own insights"
  ON public.performance_ai_insights FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger for updated_at on social_connections
CREATE TRIGGER update_social_connections_updated_at
  BEFORE UPDATE ON public.social_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Function to compute engagement rate
CREATE OR REPLACE FUNCTION public.compute_engagement_rate()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.reach IS NOT NULL AND NEW.reach > 0 THEN
    NEW.engagement_rate := ((COALESCE(NEW.likes, 0) + COALESCE(NEW.comments, 0) + COALESCE(NEW.shares, 0) + COALESCE(NEW.saves, 0))::FLOAT / NEW.reach) * 100;
  ELSIF NEW.impressions IS NOT NULL AND NEW.impressions > 0 THEN
    NEW.engagement_rate := ((COALESCE(NEW.likes, 0) + COALESCE(NEW.comments, 0) + COALESCE(NEW.shares, 0) + COALESCE(NEW.saves, 0))::FLOAT / NEW.impressions) * 100;
  ELSE
    NEW.engagement_rate := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-compute engagement rate
CREATE TRIGGER compute_post_engagement_rate
  BEFORE INSERT OR UPDATE ON public.post_metrics
  FOR EACH ROW
  EXECUTE FUNCTION public.compute_engagement_rate();