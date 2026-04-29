ALTER TABLE public.notification_queue DROP CONSTRAINT IF EXISTS notification_queue_type_check;
ALTER TABLE public.notification_queue ADD CONSTRAINT notification_queue_type_check CHECK (
  type = ANY (ARRAY[
    'deadline','render_complete','approval_request','approval_approved','approval_rejected',
    'recurring_event_created',
    'autopilot_qa_review','autopilot_blocked','autopilot_failed','autopilot_posted',
    'autopilot_daily_digest','autopilot_strike','autopilot_locked',
    'autopilot_insights_ready'
  ])
);