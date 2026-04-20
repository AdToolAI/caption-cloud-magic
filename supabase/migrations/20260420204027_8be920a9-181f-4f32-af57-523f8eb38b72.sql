
-- Enable pgvector extension for semantic similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- =====================================================
-- AI Response Cache (Semantic Search)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.ai_response_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint TEXT NOT NULL,
  prompt_hash TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  prompt_embedding vector(1536),
  response_data JSONB NOT NULL,
  language TEXT DEFAULT 'en',
  model TEXT,
  hit_count INTEGER NOT NULL DEFAULT 0,
  last_hit_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_cache_endpoint ON public.ai_response_cache(endpoint);
CREATE INDEX IF NOT EXISTS idx_ai_cache_hash ON public.ai_response_cache(prompt_hash);
CREATE INDEX IF NOT EXISTS idx_ai_cache_expires ON public.ai_response_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_ai_cache_embedding ON public.ai_response_cache 
  USING ivfflat (prompt_embedding vector_cosine_ops) WITH (lists = 100);

ALTER TABLE public.ai_response_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view AI cache"
  ON public.ai_response_cache FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- =====================================================
-- Cache Stats (Hit Rate Tracking)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.cache_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint TEXT NOT NULL,
  cache_type TEXT NOT NULL,
  hit BOOLEAN NOT NULL,
  latency_ms INTEGER,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cache_stats_endpoint ON public.cache_stats(endpoint, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_cache_stats_type ON public.cache_stats(cache_type, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_cache_stats_recorded ON public.cache_stats(recorded_at DESC);

ALTER TABLE public.cache_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view cache stats"
  ON public.cache_stats FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- =====================================================
-- View: cache_stats_recent (last hour aggregated)
-- =====================================================
CREATE OR REPLACE VIEW public.cache_stats_recent AS
SELECT
  endpoint,
  cache_type,
  COUNT(*) AS total_requests,
  COUNT(*) FILTER (WHERE hit) AS hits,
  COUNT(*) FILTER (WHERE NOT hit) AS misses,
  ROUND(
    (COUNT(*) FILTER (WHERE hit)::NUMERIC / NULLIF(COUNT(*), 0)) * 100,
    1
  ) AS hit_rate_pct,
  ROUND(AVG(latency_ms))::INTEGER AS avg_latency_ms,
  MAX(recorded_at) AS last_recorded_at
FROM public.cache_stats
WHERE recorded_at > now() - INTERVAL '1 hour'
GROUP BY endpoint, cache_type
ORDER BY total_requests DESC;

-- =====================================================
-- Semantic similarity match function
-- =====================================================
CREATE OR REPLACE FUNCTION public.match_ai_cache(
  query_embedding vector(1536),
  query_endpoint TEXT,
  query_language TEXT DEFAULT 'en',
  match_threshold FLOAT DEFAULT 0.95,
  match_count INTEGER DEFAULT 1
)
RETURNS TABLE(
  id UUID,
  response_data JSONB,
  similarity FLOAT,
  hit_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.response_data,
    1 - (c.prompt_embedding <=> query_embedding) AS similarity,
    c.hit_count
  FROM public.ai_response_cache c
  WHERE c.endpoint = query_endpoint
    AND c.language = query_language
    AND c.expires_at > now()
    AND c.prompt_embedding IS NOT NULL
    AND 1 - (c.prompt_embedding <=> query_embedding) >= match_threshold
  ORDER BY c.prompt_embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- =====================================================
-- Cleanup expired AI cache entries
-- =====================================================
CREATE OR REPLACE FUNCTION public.cleanup_expired_ai_cache()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.ai_response_cache
  WHERE expires_at < now();
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- Also cleanup old cache stats (>7 days)
  DELETE FROM public.cache_stats
  WHERE recorded_at < now() - INTERVAL '7 days';

  RETURN v_deleted;
END;
$$;

-- =====================================================
-- Update system_config: Lambda 6 → 10, safe floor 6
-- =====================================================
INSERT INTO public.system_config (key, value, description)
VALUES 
  ('lambda_max_concurrent', '10'::jsonb, 'Maximum parallel Lambda renders (Phase 2: 6→10)'),
  ('lambda_max_concurrent_safe', '6'::jsonb, 'Safe fallback Lambda concurrency (Phase 2: 3→6)')
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  updated_at = now();
