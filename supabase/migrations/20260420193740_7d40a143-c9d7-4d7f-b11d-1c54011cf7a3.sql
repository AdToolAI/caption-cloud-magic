-- Suppression list: emails we must not send to
CREATE TABLE public.email_suppression_list (
  email TEXT NOT NULL PRIMARY KEY,
  reason TEXT NOT NULL CHECK (reason IN ('bounce','complaint','unsubscribe','manual')),
  suppressed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  details JSONB
);

ALTER TABLE public.email_suppression_list ENABLE ROW LEVEL SECURITY;

-- No public policies → only service_role bypasses RLS
CREATE POLICY "Admins can read suppression list"
  ON public.email_suppression_list
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Email send log: every send attempt
CREATE TABLE public.email_send_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  to_email TEXT NOT NULL,
  from_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  template TEXT,
  category TEXT NOT NULL CHECK (category IN ('transactional','marketing','system')),
  status TEXT NOT NULL CHECK (status IN ('sent','failed','suppressed')),
  resend_id TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_send_log_to_email ON public.email_send_log(to_email);
CREATE INDEX idx_email_send_log_created_at ON public.email_send_log(created_at DESC);
CREATE INDEX idx_email_send_log_status ON public.email_send_log(status);

ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read email send log"
  ON public.email_send_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));