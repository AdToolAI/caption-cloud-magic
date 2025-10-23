-- Sprint 3: Analytics & Performance Migration

-- Add missing columns to post_metrics
ALTER TABLE post_metrics
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS fetched_at TIMESTAMPTZ DEFAULT now();

-- Create unique index for external_id tracking
CREATE UNIQUE INDEX IF NOT EXISTS idx_post_metrics_external 
  ON post_metrics(provider, external_id) WHERE external_id IS NOT NULL;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_post_metrics_posted_at ON post_metrics(posted_at);
CREATE INDEX IF NOT EXISTS idx_post_metrics_engagement ON post_metrics(engagement_rate) WHERE engagement_rate IS NOT NULL;

-- Aggregated metrics view (7 days)
CREATE OR REPLACE VIEW v_metrics_summary AS
SELECT
  provider,
  date_trunc('day', posted_at) as day,
  SUM(likes) as likes,
  SUM(comments) as comments,
  SUM(shares) as shares,
  SUM(COALESCE(impressions, reach, 0)) as views,
  SUM(impressions) as impressions,
  AVG(engagement_rate) as avg_engagement
FROM post_metrics
WHERE posted_at > now() - INTERVAL '7 days'
GROUP BY provider, day
ORDER BY day ASC;

-- Top posts by engagement (30 days)
CREATE OR REPLACE VIEW v_top_posts AS
SELECT
  pm.provider,
  pm.external_id,
  pm.caption_text,
  pm.likes,
  pm.comments,
  pm.shares,
  COALESCE(pm.impressions, pm.reach, 0) as views,
  pm.engagement_rate,
  pm.post_url as permalink,
  pm.posted_at,
  pm.user_id
FROM post_metrics pm
WHERE pm.posted_at > now() - INTERVAL '30 days'
  AND pm.engagement_rate IS NOT NULL
ORDER BY pm.engagement_rate DESC
LIMIT 20;

-- Enable pg_cron and pg_net if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule daily analytics fetch at 02:00 UTC
SELECT cron.schedule(
  'daily-analytics-fetch',
  '0 2 * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://lbunafpxuskwmsrraqxl.supabase.co/functions/v1/fetch-analytics',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := jsonb_build_object('trigger', 'cron', 'time', now())
    ) as request_id;
  $$
);