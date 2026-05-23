-- Daily Cron: Auto-Refresh Meta Long-Lived Page Token
-- Läuft 03:00 UTC, ruft auto-refresh-meta-tokens edge function

-- Drop any previous version (idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-refresh-meta-tokens-daily') THEN
    PERFORM cron.unschedule('auto-refresh-meta-tokens-daily');
  END IF;
END $$;

SELECT cron.schedule(
  'auto-refresh-meta-tokens-daily',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://lbunafpxuskwmsrraqxl.supabase.co/functions/v1/auto-refresh-meta-tokens',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxidW5hZnB4dXNrd21zcnJhcXhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAxMjA3NzUsImV4cCI6MjA3NTY5Njc3NX0.gRvY8kUzrELzlhSdGNJj_CXsaT8mqaUO7F1jCEi2T7Y'
    ),
    body := jsonb_build_object('mode', 'refresh', 'source', 'cron')
  ) AS request_id;
  $$
);