-- Create table to track alert notifications (prevent spam)
CREATE TABLE IF NOT EXISTS public.alert_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL, -- 'critical', 'warning', 'info'
  metric_value NUMERIC NOT NULL,
  threshold NUMERIC NOT NULL,
  message TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_alert_notifications_type_sent 
ON public.alert_notifications(alert_type, sent_at DESC);

-- Create index for unresolved alerts
CREATE INDEX IF NOT EXISTS idx_alert_notifications_unresolved 
ON public.alert_notifications(alert_type, resolved_at) 
WHERE resolved_at IS NULL;

-- Enable RLS
ALTER TABLE public.alert_notifications ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins can view alerts
CREATE POLICY "Admins can view alert notifications"
ON public.alert_notifications
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'admin'
  )
);

-- Cleanup function for old resolved alerts (keep 30 days)
CREATE OR REPLACE FUNCTION public.cleanup_old_alerts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.alert_notifications
  WHERE resolved_at IS NOT NULL
  AND resolved_at < now() - INTERVAL '30 days';
END;
$$;