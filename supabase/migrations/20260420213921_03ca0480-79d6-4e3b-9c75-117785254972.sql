-- Schedule health-alerter every 10 minutes and weekly-health-report Sundays 08:00 UTC
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove any existing schedules with same names (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('health-alerter-every-10min');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('weekly-health-report-sunday-8am');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'health-alerter-every-10min',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://lbunafpxuskwmsrraqxl.supabase.co/functions/v1/health-alerter',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := jsonb_build_object('trigger', 'cron', 'time', now())
  ) as request_id;
  $$
);

SELECT cron.schedule(
  'weekly-health-report-sunday-8am',
  '0 8 * * 0',
  $$
  SELECT net.http_post(
    url := 'https://lbunafpxuskwmsrraqxl.supabase.co/functions/v1/weekly-health-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := jsonb_build_object('trigger', 'cron', 'time', now())
  ) as request_id;
  $$
);