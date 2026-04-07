
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS twitch_username TEXT;

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_profiles_twitch_username ON public.profiles(twitch_username) WHERE twitch_username IS NOT NULL;
