-- Win-back email log for idempotency
CREATE TABLE public.winback_email_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('day_14', 'day_30')),
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  email_message_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  CONSTRAINT winback_email_log_user_stage_unique UNIQUE (user_id, stage)
);

CREATE INDEX idx_winback_email_log_user_id ON public.winback_email_log(user_id);
CREATE INDEX idx_winback_email_log_sent_at ON public.winback_email_log(sent_at DESC);

ALTER TABLE public.winback_email_log ENABLE ROW LEVEL SECURITY;

-- Users can view their own logs
CREATE POLICY "Users can view own winback logs"
ON public.winback_email_log
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Service role only writes (no INSERT policy means only service-role can insert via bypass)
-- No UPDATE/DELETE policies = append-only for service role