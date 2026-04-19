-- Add reminder_pushes_enabled column to notification_preferences
ALTER TABLE public.notification_preferences
ADD COLUMN IF NOT EXISTS reminder_pushes_enabled BOOLEAN NOT NULL DEFAULT true;

-- Create push_reminder_log table
CREATE TABLE IF NOT EXISTS public.push_reminder_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  reminder_step SMALLINT NOT NULL CHECK (reminder_step IN (1, 3, 7)),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  progress_at_send INTEGER,
  status TEXT NOT NULL DEFAULT 'sent',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique index for idempotency
CREATE UNIQUE INDEX IF NOT EXISTS push_reminder_log_user_step_unique
  ON public.push_reminder_log(user_id, reminder_step);

-- Index for user lookups
CREATE INDEX IF NOT EXISTS push_reminder_log_user_id_idx
  ON public.push_reminder_log(user_id);

-- Enable RLS
ALTER TABLE public.push_reminder_log ENABLE ROW LEVEL SECURITY;

-- Users can view their own log entries
CREATE POLICY "Users can view own push reminder log"
  ON public.push_reminder_log
  FOR SELECT
  USING (auth.uid() = user_id);