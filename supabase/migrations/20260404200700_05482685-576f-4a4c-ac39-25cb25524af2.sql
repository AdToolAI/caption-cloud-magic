
-- Add push notification columns to notification_preferences
ALTER TABLE public.notification_preferences
ADD COLUMN IF NOT EXISTS push_enabled boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS push_subscription jsonb;
