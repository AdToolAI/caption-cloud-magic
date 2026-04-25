
CREATE TABLE public.user_media_library (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('video','image')),
  source        TEXT NOT NULL CHECK (source IN ('pixabay','pexels','upload')),
  external_id   TEXT,
  url           TEXT NOT NULL,
  thumbnail_url TEXT,
  width         INTEGER,
  height        INTEGER,
  duration_sec  NUMERIC,
  tags          TEXT[] DEFAULT '{}',
  category      TEXT,
  author_name   TEXT,
  author_url    TEXT,
  is_favorite   BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_media_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own media library"
  ON public.user_media_library FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own media library"
  ON public.user_media_library FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own media library"
  ON public.user_media_library FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own media library"
  ON public.user_media_library FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_user_media_library_user_type
  ON public.user_media_library(user_id, type, created_at DESC);

CREATE UNIQUE INDEX idx_user_media_library_unique_external
  ON public.user_media_library(user_id, source, external_id)
  WHERE external_id IS NOT NULL;
