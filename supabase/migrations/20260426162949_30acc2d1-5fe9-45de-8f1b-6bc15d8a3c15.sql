
-- Tabelle für NLE-Exports
CREATE TABLE public.composer_nle_exports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.composer_projects(id) ON DELETE CASCADE,
  format TEXT NOT NULL CHECK (format IN ('fcpxml', 'edl', 'bundle')),
  storage_path TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL DEFAULT 0,
  scene_count INTEGER NOT NULL DEFAULT 0,
  total_duration_sec NUMERIC(10, 2) NOT NULL DEFAULT 0,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_composer_nle_exports_user ON public.composer_nle_exports(user_id);
CREATE INDEX idx_composer_nle_exports_project ON public.composer_nle_exports(project_id);
CREATE INDEX idx_composer_nle_exports_expires ON public.composer_nle_exports(expires_at);

ALTER TABLE public.composer_nle_exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own NLE exports"
  ON public.composer_nle_exports FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users create own NLE exports"
  ON public.composer_nle_exports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own NLE exports"
  ON public.composer_nle_exports FOR DELETE
  USING (auth.uid() = user_id);

-- Privater Storage-Bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('composer-nle-exports', 'composer-nle-exports', false, 524288000) -- 500 MB
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: erstes Path-Segment = user_id
CREATE POLICY "Users view own NLE export files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'composer-nle-exports'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users upload own NLE export files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'composer-nle-exports'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users delete own NLE export files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'composer-nle-exports'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
