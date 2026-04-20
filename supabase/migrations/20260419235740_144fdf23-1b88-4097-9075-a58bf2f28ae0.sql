-- 1. Add grandfathering flag to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS sora2_grandfathered BOOLEAN NOT NULL DEFAULT false;

-- 2. Backfill: all existing users get access
UPDATE public.profiles
SET sora2_grandfathered = true
WHERE created_at < now();

-- 3. Waitlist table for new users who want notification
CREATE TABLE IF NOT EXISTS public.sora2_waitlist (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  email TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  notified_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.sora2_waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own waitlist entry"
ON public.sora2_waitlist
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can join the waitlist"
ON public.sora2_waitlist
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can leave the waitlist"
ON public.sora2_waitlist
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_sora2_waitlist_user ON public.sora2_waitlist(user_id);