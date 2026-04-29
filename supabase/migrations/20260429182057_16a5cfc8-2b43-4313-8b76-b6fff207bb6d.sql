-- Session G: Autopilot Notifications

-- Extend notification_queue check constraint with autopilot event types
ALTER TABLE public.notification_queue DROP CONSTRAINT IF EXISTS notification_queue_type_check;
ALTER TABLE public.notification_queue ADD CONSTRAINT notification_queue_type_check
  CHECK (type = ANY (ARRAY[
    'deadline','render_complete','approval_request','approval_approved','approval_rejected','recurring_event_created',
    'autopilot_qa_review','autopilot_blocked','autopilot_failed','autopilot_posted','autopilot_daily_digest','autopilot_strike','autopilot_locked'
  ]));

-- Allow inserts from edge functions (service role bypasses RLS, but explicit policy for clarity)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='notification_queue' AND policyname='Service role can insert notifications') THEN
    CREATE POLICY "Service role can insert notifications"
      ON public.notification_queue FOR INSERT
      WITH CHECK (true);
  END IF;
END $$;

-- Index for unread autopilot notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread_autopilot
  ON public.notification_queue (user_id, created_at DESC)
  WHERE read = false AND type LIKE 'autopilot_%';
