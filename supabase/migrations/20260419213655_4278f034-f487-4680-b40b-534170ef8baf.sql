-- Add welcome bonus tracking columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS welcome_bonus_granted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS welcome_bonus_seen_at TIMESTAMPTZ;

-- Index for fast lookup of users eligible for backfill / metrics
CREATE INDEX IF NOT EXISTS idx_profiles_welcome_bonus_granted_at
  ON public.profiles (welcome_bonus_granted_at)
  WHERE welcome_bonus_granted_at IS NOT NULL;
