-- Create posts_history table for historical post performance
CREATE TABLE IF NOT EXISTS public.posts_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('instagram','tiktok','linkedin','x','facebook','youtube')),
  account_id TEXT NOT NULL,
  post_id TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL,
  impressions BIGINT,
  reach BIGINT,
  likes BIGINT,
  comments BIGINT,
  shares BIGINT,
  saves BIGINT,
  clicks BIGINT,
  watch_time_seconds BIGINT,
  engagement_score NUMERIC,
  raw JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, platform, post_id)
);

-- Create index for performance (without immutable predicate)
CREATE INDEX idx_posts_history_user_platform_time 
ON public.posts_history(user_id, platform, published_at DESC);

-- Enable RLS
ALTER TABLE public.posts_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for posts_history
CREATE POLICY "Users can view own history" 
ON public.posts_history FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Service can insert history" 
ON public.posts_history FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Service can update history" 
ON public.posts_history FOR UPDATE 
USING (true);

-- Create posting_slots table for 14-day forecast
CREATE TABLE IF NOT EXISTS public.posting_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('instagram','tiktok','linkedin','x','facebook','youtube')),
  account_id TEXT NOT NULL,
  slot_start TIMESTAMPTZ NOT NULL,
  slot_end TIMESTAMPTZ NOT NULL,
  score NUMERIC NOT NULL CHECK (score >= 0 AND score <= 100),
  reasons TEXT[],
  features JSONB,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, platform, account_id, slot_start)
);

-- Create index for performance
CREATE INDEX idx_posting_slots_user_platform_time 
ON public.posting_slots(user_id, platform, slot_start);

-- Enable RLS
ALTER TABLE public.posting_slots ENABLE ROW LEVEL SECURITY;

-- RLS Policies for posting_slots
CREATE POLICY "Users can view own slots" 
ON public.posting_slots FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Service can manage slots" 
ON public.posting_slots FOR ALL 
USING (true);