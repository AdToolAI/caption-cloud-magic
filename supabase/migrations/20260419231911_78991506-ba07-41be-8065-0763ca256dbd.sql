-- 1. Add columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS drip_emails_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS unsubscribe_token UUID NOT NULL DEFAULT gen_random_uuid();

-- Backfill tokens for existing rows (safety)
UPDATE public.profiles SET unsubscribe_token = gen_random_uuid() WHERE unsubscribe_token IS NULL;

-- Unique index on token
CREATE UNIQUE INDEX IF NOT EXISTS profiles_unsubscribe_token_key ON public.profiles(unsubscribe_token);

-- 2. Create drip_email_log table
CREATE TABLE IF NOT EXISTS public.drip_email_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  drip_step SMALLINT NOT NULL CHECK (drip_step IN (1, 3, 7)),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  progress_at_send INTEGER,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'skipped', 'dry_run')),
  resend_message_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Strict idempotency: only one log per (user, step) for sent/failed (allow multiple skipped)
CREATE UNIQUE INDEX IF NOT EXISTS drip_email_log_user_step_unique
  ON public.drip_email_log(user_id, drip_step)
  WHERE status IN ('sent', 'failed');

CREATE INDEX IF NOT EXISTS drip_email_log_user_id_idx ON public.drip_email_log(user_id);
CREATE INDEX IF NOT EXISTS drip_email_log_sent_at_idx ON public.drip_email_log(sent_at DESC);

-- 3. Enable RLS
ALTER TABLE public.drip_email_log ENABLE ROW LEVEL SECURITY;

-- Users can read their own log entries
CREATE POLICY "Users can view their own drip log"
  ON public.drip_email_log
  FOR SELECT
  USING (auth.uid() = user_id);

-- No insert/update/delete policies → only service role (edge function) can write