-- Create enum for Instagram media types
CREATE TYPE ig_media_type AS ENUM ('IMAGE', 'VIDEO', 'REEL', 'CAROUSEL_ALBUM');

-- Table for daily account metrics (time series)
CREATE TABLE public.ig_account_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  ig_user_id TEXT NOT NULL,
  reach_day INTEGER NOT NULL DEFAULT 0,
  reach_week INTEGER,
  reach_28d INTEGER,
  followers_count INTEGER NOT NULL DEFAULT 0,
  media_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(date, ig_user_id)
);

-- Table for Instagram media (master data)
CREATE TABLE public.ig_media (
  media_id TEXT PRIMARY KEY,
  ig_user_id TEXT NOT NULL,
  media_type ig_media_type NOT NULL,
  caption TEXT,
  permalink TEXT NOT NULL,
  thumbnail_url TEXT,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table for media metrics (current lifetime values per media)
CREATE TABLE public.ig_media_metrics (
  media_id TEXT PRIMARY KEY REFERENCES public.ig_media(media_id) ON DELETE CASCADE,
  reach INTEGER NOT NULL DEFAULT 0,
  saved INTEGER NOT NULL DEFAULT 0,
  plays INTEGER,  -- only for VIDEO/REEL
  last_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.ig_account_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ig_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ig_media_metrics ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can view all Instagram data (since it's tied to app-level connection)
CREATE POLICY "Users can view account daily metrics"
  ON public.ig_account_daily
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage account daily metrics"
  ON public.ig_account_daily
  FOR ALL
  USING (true);

CREATE POLICY "Users can view media"
  ON public.ig_media
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage media"
  ON public.ig_media
  FOR ALL
  USING (true);

CREATE POLICY "Users can view media metrics"
  ON public.ig_media_metrics
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage media metrics"
  ON public.ig_media_metrics
  FOR ALL
  USING (true);

-- Indexes for performance
CREATE INDEX idx_ig_account_daily_date ON public.ig_account_daily(date DESC);
CREATE INDEX idx_ig_account_daily_ig_user ON public.ig_account_daily(ig_user_id);
CREATE INDEX idx_ig_media_timestamp ON public.ig_media(timestamp DESC);
CREATE INDEX idx_ig_media_ig_user ON public.ig_media(ig_user_id);

-- Trigger to update updated_at on ig_media
CREATE TRIGGER update_ig_media_updated_at
  BEFORE UPDATE ON public.ig_media
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();