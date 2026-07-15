CREATE TABLE IF NOT EXISTS public.voice_library_cache (
  voice_id text PRIMARY KEY,
  name text NOT NULL,
  language text NOT NULL,
  supported_languages text[] NOT NULL DEFAULT ARRAY[]::text[],
  accent text,
  gender text,
  age text,
  use_case text,
  description text,
  preview_url text,
  is_native boolean NOT NULL DEFAULT false,
  popularity integer NOT NULL DEFAULT 0,
  tier text NOT NULL DEFAULT 'community',
  category text,
  labels jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.voice_library_cache TO authenticated;
GRANT ALL ON public.voice_library_cache TO service_role;

ALTER TABLE public.voice_library_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Voice library is readable by authenticated users"
  ON public.voice_library_cache FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_voice_library_cache_language ON public.voice_library_cache (language);
CREATE INDEX IF NOT EXISTS idx_voice_library_cache_native ON public.voice_library_cache (is_native);
CREATE INDEX IF NOT EXISTS idx_voice_library_cache_tier ON public.voice_library_cache (tier);
CREATE INDEX IF NOT EXISTS idx_voice_library_cache_popularity ON public.voice_library_cache (popularity DESC);
CREATE INDEX IF NOT EXISTS idx_voice_library_cache_supported_langs ON public.voice_library_cache USING gin (supported_languages);
