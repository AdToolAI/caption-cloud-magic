
-- 1) Add AI triage + notification columns
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS ai_category TEXT,
  ADD COLUMN IF NOT EXISTS ai_severity TEXT,
  ADD COLUMN IF NOT EXISTS ai_root_cause TEXT,
  ADD COLUMN IF NOT EXISTS ai_eta_hours INTEGER,
  ADD COLUMN IF NOT EXISTS ai_suggested_reply TEXT,
  ADD COLUMN IF NOT EXISTS ai_language TEXT DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS ai_confidence NUMERIC,
  ADD COLUMN IF NOT EXISTS ai_analyzed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS linked_incident_id UUID REFERENCES public.status_incidents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolved_notification_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS contact_name TEXT;

-- 2) Index for admin inbox sorting / filtering
CREATE INDEX IF NOT EXISTS idx_support_tickets_status_created
  ON public.support_tickets(status, created_at DESC);

-- 3) Trigger: when status changes to 'resolved', call notify-ticket-resolved
CREATE OR REPLACE FUNCTION public.handle_support_ticket_resolved()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_url TEXT;
  v_service_key TEXT;
BEGIN
  IF NEW.status = 'resolved'
     AND (OLD.status IS DISTINCT FROM 'resolved')
     AND NEW.resolved_notification_sent_at IS NULL THEN

    SELECT value INTO v_project_url FROM public.app_secrets WHERE key = 'SUPABASE_URL' LIMIT 1;
    SELECT value INTO v_service_key FROM public.app_secrets WHERE key = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;

    IF v_project_url IS NOT NULL AND v_service_key IS NOT NULL THEN
      PERFORM net.http_post(
        url := v_project_url || '/functions/v1/notify-ticket-resolved',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_key
        ),
        body := jsonb_build_object('ticket_id', NEW.id)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_ticket_resolved ON public.support_tickets;
CREATE TRIGGER trg_support_ticket_resolved
  AFTER UPDATE ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_support_ticket_resolved();

-- 4) Admin policy: allow admins to view/update all tickets
DROP POLICY IF EXISTS "Admins manage all tickets" ON public.support_tickets;
CREATE POLICY "Admins manage all tickets" ON public.support_tickets
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
