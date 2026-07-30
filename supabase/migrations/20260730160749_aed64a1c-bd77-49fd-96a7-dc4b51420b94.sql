CREATE TABLE public.autopilot_lounge_feed_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  brand_kit_id UUID,
  language TEXT NOT NULL DEFAULT 'de',
  payload JSONB NOT NULL DEFAULT '[]'::jsonb,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.autopilot_lounge_feed_cache TO authenticated;
GRANT ALL ON public.autopilot_lounge_feed_cache TO service_role;

ALTER TABLE public.autopilot_lounge_feed_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own lounge feed"
ON public.autopilot_lounge_feed_cache
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE INDEX idx_lounge_feed_lookup
ON public.autopilot_lounge_feed_cache (user_id, brand_kit_id, language, expires_at DESC);

CREATE TRIGGER update_autopilot_lounge_feed_cache_updated_at
BEFORE UPDATE ON public.autopilot_lounge_feed_cache
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();