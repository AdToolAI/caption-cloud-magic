-- Enable pg_cron extension for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Unschedule any existing monthly credit reset job (to avoid duplicates)
SELECT cron.unschedule('monthly-credit-reset') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'monthly-credit-reset'
);

-- Schedule monthly credit reset to run on the 1st of every month at 00:00 UTC
SELECT cron.schedule(
  'monthly-credit-reset',
  '0 0 1 * *',
  $$SELECT public.reset_monthly_credits();$$
);