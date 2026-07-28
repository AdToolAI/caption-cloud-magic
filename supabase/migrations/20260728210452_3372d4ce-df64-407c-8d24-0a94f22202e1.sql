
CREATE TABLE public.instant_avatar_rate (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ip_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_instant_avatar_rate_ip_time ON public.instant_avatar_rate (ip_hash, created_at DESC);
GRANT ALL ON public.instant_avatar_rate TO service_role;
ALTER TABLE public.instant_avatar_rate ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON public.instant_avatar_rate FOR ALL TO service_role USING (true) WITH CHECK (true);
