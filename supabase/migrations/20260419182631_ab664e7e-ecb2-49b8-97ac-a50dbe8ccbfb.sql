-- Add pause field to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS level_auto_pause_until TIMESTAMPTZ;

-- Create creator_level_history table
CREATE TABLE IF NOT EXISTS public.creator_level_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  level_from TEXT,
  level_to TEXT NOT NULL,
  trigger TEXT NOT NULL CHECK (trigger IN ('auto', 'manual')),
  metrics_snapshot JSONB DEFAULT '{}'::jsonb,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_creator_level_history_user
  ON public.creator_level_history (user_id, created_at DESC);

ALTER TABLE public.creator_level_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own level history"
ON public.creator_level_history
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Service role manages level history"
ON public.creator_level_history
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);