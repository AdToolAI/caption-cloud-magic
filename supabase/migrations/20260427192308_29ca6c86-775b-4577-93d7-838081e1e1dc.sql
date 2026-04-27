CREATE TABLE IF NOT EXISTS public.stock_search_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key text NOT NULL UNIQUE,
  query text NOT NULL,
  media_type text NOT NULL CHECK (media_type IN ('video','image')),
  results_json jsonb NOT NULL,
  provider_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  hit_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_stock_search_cache_expires_at ON public.stock_search_cache (expires_at);
CREATE INDEX IF NOT EXISTS idx_stock_search_cache_cache_key ON public.stock_search_cache (cache_key);

ALTER TABLE public.stock_search_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stock_cache_read_authenticated"
  ON public.stock_search_cache
  FOR SELECT
  TO authenticated
  USING (true);
