-- Fix security warning: Move pg_net extension out of public schema
-- Create extensions schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS extensions;

-- Move pg_net to extensions schema
DROP EXTENSION IF EXISTS pg_net CASCADE;
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;

-- Update function to use extensions schema
CREATE OR REPLACE FUNCTION trigger_status_change_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_supabase_url TEXT;
  v_service_role_key TEXT;
BEGIN
  -- Only trigger on status change
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    -- Get environment variables
    v_supabase_url := current_setting('app.settings.supabase_url', true);
    v_service_role_key := current_setting('app.settings.service_role_key', true);
    
    -- Call calendar-send-notification edge function asynchronously
    PERFORM
      extensions.net.http_post(
        url := v_supabase_url || '/functions/v1/calendar-send-notification',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_role_key
        ),
        body := jsonb_build_object(
          'event_id', NEW.id,
          'notification_type', 'status_changed'
        ),
        timeout_milliseconds := 5000
      );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Re-create trigger
DROP TRIGGER IF EXISTS on_calendar_event_status_change ON calendar_events;
CREATE TRIGGER on_calendar_event_status_change
  AFTER UPDATE ON calendar_events
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION trigger_status_change_notification();

-- Update cron jobs to use extensions schema
SELECT cron.unschedule('calendar-24h-reminders');
SELECT cron.schedule(
  'calendar-24h-reminders',
  '0 9 * * *',
  $$
  SELECT
    extensions.net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/calendar-send-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := jsonb_build_object(
        'notification_type', '24h_reminder',
        'check_time', (now() + interval '24 hours')::text
      ),
      timeout_milliseconds := 30000
    );
  $$
);

SELECT cron.unschedule('calendar-1h-reminders');
SELECT cron.schedule(
  'calendar-1h-reminders',
  '0 * * * *',
  $$
  SELECT
    extensions.net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/calendar-send-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := jsonb_build_object(
        'notification_type', '1h_reminder',
        'check_time', (now() + interval '1 hour')::text
      ),
      timeout_milliseconds := 30000
    );
  $$
);