-- 1. Feature usage tracking (powers FeatureDiscoveryWatcher)
CREATE TABLE IF NOT EXISTS public.feature_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  feature_key TEXT NOT NULL,
  use_count INTEGER NOT NULL DEFAULT 1,
  first_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, feature_key)
);

CREATE INDEX IF NOT EXISTS idx_feature_usage_user
  ON public.feature_usage_events(user_id);

ALTER TABLE public.feature_usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own feature usage"
  ON public.feature_usage_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own feature usage"
  ON public.feature_usage_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own feature usage"
  ON public.feature_usage_events FOR UPDATE
  USING (auth.uid() = user_id);

-- 2. Dismissed upgrade prompts on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS upgrade_prompts_dismissed JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 3. Atomic increment helper for feature usage
CREATE OR REPLACE FUNCTION public.increment_feature_usage(
  p_user_id UUID,
  p_feature_key TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO public.feature_usage_events (user_id, feature_key, use_count)
  VALUES (p_user_id, p_feature_key, 1)
  ON CONFLICT (user_id, feature_key)
  DO UPDATE SET
    use_count = public.feature_usage_events.use_count + 1,
    last_used_at = now()
  RETURNING use_count INTO v_count;
  RETURN v_count;
END;
$$;