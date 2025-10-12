-- Smart Content Scheduling Tables

-- Recurring posts for automated content
CREATE TABLE IF NOT EXISTS public.recurring_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  caption TEXT NOT NULL,
  image_url TEXT,
  platform TEXT NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'biweekly', 'monthly')),
  timezone TEXT NOT NULL DEFAULT 'UTC',
  next_scheduled_time TIMESTAMP WITH TIME ZONE NOT NULL,
  last_posted_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  tags JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Auto-posting queue
CREATE TABLE IF NOT EXISTS public.auto_post_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  post_id UUID,
  recurring_post_id UUID,
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'posted', 'failed')),
  platform TEXT NOT NULL,
  error_message TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  processed_at TIMESTAMP WITH TIME ZONE
);

-- Advanced Analytics Tables

-- Hashtag performance tracking
CREATE TABLE IF NOT EXISTS public.hashtag_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  hashtag TEXT NOT NULL,
  platform TEXT NOT NULL,
  posts_count INTEGER NOT NULL DEFAULT 0,
  total_reach INTEGER NOT NULL DEFAULT 0,
  total_engagement INTEGER NOT NULL DEFAULT 0,
  avg_engagement_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  last_used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, hashtag, platform)
);

-- Best performing content
CREATE TABLE IF NOT EXISTS public.best_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  post_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  caption_text TEXT,
  engagement_score NUMERIC(10,2) NOT NULL,
  reach INTEGER,
  engagement_rate NUMERIC(5,2),
  posted_at TIMESTAMP WITH TIME ZONE NOT NULL,
  analyzed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  insights_json JSONB DEFAULT '{}'::jsonb
);

-- Campaign ROI tracking
CREATE TABLE IF NOT EXISTS public.campaign_roi (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  campaign_name TEXT NOT NULL,
  platform TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  budget_spent NUMERIC(10,2) DEFAULT 0,
  total_reach INTEGER DEFAULT 0,
  total_engagement INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  revenue NUMERIC(10,2) DEFAULT 0,
  roi_percent NUMERIC(5,2),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.recurring_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auto_post_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hashtag_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.best_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_roi ENABLE ROW LEVEL SECURITY;

-- RLS Policies for recurring_posts
CREATE POLICY "Users can create own recurring posts"
  ON public.recurring_posts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own recurring posts"
  ON public.recurring_posts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own recurring posts"
  ON public.recurring_posts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own recurring posts"
  ON public.recurring_posts FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for auto_post_queue
CREATE POLICY "Users can create own queue items"
  ON public.auto_post_queue FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own queue items"
  ON public.auto_post_queue FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own queue items"
  ON public.auto_post_queue FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own queue items"
  ON public.auto_post_queue FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for hashtag_performance
CREATE POLICY "Users can create own hashtag performance"
  ON public.hashtag_performance FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own hashtag performance"
  ON public.hashtag_performance FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own hashtag performance"
  ON public.hashtag_performance FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policies for best_content
CREATE POLICY "Users can create own best content"
  ON public.best_content FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own best content"
  ON public.best_content FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policies for campaign_roi
CREATE POLICY "Users can create own campaign ROI"
  ON public.campaign_roi FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own campaign ROI"
  ON public.campaign_roi FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own campaign ROI"
  ON public.campaign_roi FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own campaign ROI"
  ON public.campaign_roi FOR DELETE
  USING (auth.uid() = user_id);

-- Triggers for updated_at
CREATE TRIGGER update_recurring_posts_updated_at
  BEFORE UPDATE ON public.recurring_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_hashtag_performance_updated_at
  BEFORE UPDATE ON public.hashtag_performance
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_campaign_roi_updated_at
  BEFORE UPDATE ON public.campaign_roi
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();