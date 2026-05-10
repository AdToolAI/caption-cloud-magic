CREATE TABLE IF NOT EXISTS public.sfx_library_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cache_key text NOT NULL UNIQUE,
  query text NOT NULL,
  category text,
  source text NOT NULL,
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  result_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_sfx_library_cache_key ON public.sfx_library_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_sfx_library_cache_expires ON public.sfx_library_cache(expires_at);

ALTER TABLE public.sfx_library_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read sfx cache"
  ON public.sfx_library_cache FOR SELECT
  TO authenticated
  USING (true);

-- No insert/update/delete policies → only service role (edge function) can write.
