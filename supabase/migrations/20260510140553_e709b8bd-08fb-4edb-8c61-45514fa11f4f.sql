-- Stock Video search cache (24h TTL)
CREATE TABLE IF NOT EXISTS public.stock_video_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_hash TEXT NOT NULL UNIQUE,
  query TEXT,
  filters JSONB,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours')
);

CREATE INDEX IF NOT EXISTS stock_video_cache_expires_idx ON public.stock_video_cache (expires_at);

ALTER TABLE public.stock_video_cache ENABLE ROW LEVEL SECURITY;

-- Cache is public-read for everyone (it's just stock metadata, no PII)
CREATE POLICY "stock_video_cache readable by anyone"
  ON public.stock_video_cache FOR SELECT
  USING (true);

-- Only service role writes (edge function). Authenticated insert allowed for cache warming via RPC.
CREATE POLICY "stock_video_cache insert by service"
  ON public.stock_video_cache FOR INSERT
  WITH CHECK (true);

CREATE POLICY "stock_video_cache update by service"
  ON public.stock_video_cache FOR UPDATE
  USING (true);


-- User video library (favorites for stock videos)
CREATE TABLE IF NOT EXISTS public.user_video_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL DEFAULT 'stock_video',
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  title TEXT,
  thumbnail_url TEXT,
  preview_url TEXT,
  download_url TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  duration_sec NUMERIC,
  fps NUMERIC,
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}'::jsonb,
  is_favorite BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, source, external_id)
);

CREATE INDEX IF NOT EXISTS user_video_library_user_idx ON public.user_video_library (user_id, created_at DESC);

ALTER TABLE public.user_video_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_video_library select own"
  ON public.user_video_library FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "user_video_library insert own"
  ON public.user_video_library FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_video_library update own"
  ON public.user_video_library FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "user_video_library delete own"
  ON public.user_video_library FOR DELETE
  USING (auth.uid() = user_id);