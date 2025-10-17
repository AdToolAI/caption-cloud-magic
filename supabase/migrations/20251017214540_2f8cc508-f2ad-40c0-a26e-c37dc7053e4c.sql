-- Create fb_page_daily table for Facebook Page metrics
CREATE TABLE IF NOT EXISTS public.fb_page_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  page_id TEXT NOT NULL,
  impressions INTEGER DEFAULT 0,
  post_engagements INTEGER DEFAULT 0,
  total_actions INTEGER DEFAULT 0,
  video_views INTEGER DEFAULT 0,
  fans_total INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(date, page_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_fb_page_daily_date ON public.fb_page_daily(date DESC);
CREATE INDEX IF NOT EXISTS idx_fb_page_daily_page_id ON public.fb_page_daily(page_id);

-- Enable RLS
ALTER TABLE public.fb_page_daily ENABLE ROW LEVEL SECURITY;

-- Policy: Service role can manage all data (for edge functions)
CREATE POLICY "Service role can manage fb_page_daily"
ON public.fb_page_daily
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Comment for documentation
COMMENT ON TABLE public.fb_page_daily IS 'Stores daily Facebook Page metrics from Graph API v24';