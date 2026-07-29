ALTER TABLE public.voice_library_cache
  ADD COLUMN IF NOT EXISTS descriptive text,
  ADD COLUMN IF NOT EXISTS locale text,
  ADD COLUMN IF NOT EXISTS quality text,
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
    GENERATED ALWAYS AS (
      to_tsvector('simple',
        coalesce(name,'') || ' ' ||
        coalesce(description,'') || ' ' ||
        coalesce(accent,'') || ' ' ||
        coalesce(use_case,'') || ' ' ||
        coalesce(descriptive,'')
      )
    ) STORED;

CREATE INDEX IF NOT EXISTS idx_vlc_search_tsv ON public.voice_library_cache USING gin (search_tsv);
CREATE INDEX IF NOT EXISTS idx_vlc_gender ON public.voice_library_cache (gender);
CREATE INDEX IF NOT EXISTS idx_vlc_age ON public.voice_library_cache (age);
CREATE INDEX IF NOT EXISTS idx_vlc_accent ON public.voice_library_cache (accent);
CREATE INDEX IF NOT EXISTS idx_vlc_use_case ON public.voice_library_cache (use_case);
CREATE INDEX IF NOT EXISTS idx_vlc_name_trgm ON public.voice_library_cache USING gin (name gin_trgm_ops);

CREATE TABLE IF NOT EXISTS public.voice_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  voice_id text NOT NULL,
  voice_name text,
  language text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, voice_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.voice_favorites TO authenticated;
GRANT ALL ON public.voice_favorites TO service_role;
ALTER TABLE public.voice_favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own voice favorites" ON public.voice_favorites;
CREATE POLICY "Users manage their own voice favorites"
  ON public.voice_favorites FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.voice_library_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  languages text[] NOT NULL DEFAULT ARRAY[]::text[],
  fetched integer NOT NULL DEFAULT 0,
  upserted integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'running',
  error text,
  trigger_source text
);

GRANT SELECT ON public.voice_library_sync_runs TO authenticated;
GRANT ALL ON public.voice_library_sync_runs TO service_role;
ALTER TABLE public.voice_library_sync_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read voice sync runs" ON public.voice_library_sync_runs;
CREATE POLICY "Admins can read voice sync runs"
  ON public.voice_library_sync_runs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX IF NOT EXISTS idx_voice_sync_runs_started ON public.voice_library_sync_runs (started_at DESC);