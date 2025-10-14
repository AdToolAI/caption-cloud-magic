-- Enable pg_net extension for HTTP calls from database
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Function to trigger status change notifications
CREATE OR REPLACE FUNCTION trigger_status_change_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
      net.http_post(
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

-- Create trigger on calendar_events for status changes
DROP TRIGGER IF EXISTS on_calendar_event_status_change ON calendar_events;
CREATE TRIGGER on_calendar_event_status_change
  AFTER UPDATE ON calendar_events
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION trigger_status_change_notification();

-- Create cron job for 24h reminders (runs daily at 9:00 UTC)
SELECT cron.schedule(
  'calendar-24h-reminders',
  '0 9 * * *',
  $$
  SELECT
    net.http_post(
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

-- Create cron job for 1h reminders (runs every hour)
SELECT cron.schedule(
  'calendar-1h-reminders',
  '0 * * * *',
  $$
  SELECT
    net.http_post(
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