-- v51 Plate-Side Face Detection Cache
CREATE TABLE IF NOT EXISTS public.plate_face_cache (
  plate_url_hash text PRIMARY KEY,
  plate_url text NOT NULL,
  width integer NOT NULL,
  height integer NOT NULL,
  faces jsonb NOT NULL DEFAULT '[]'::jsonb,
  detector text NOT NULL DEFAULT 'gemini-2.5-flash',
  frame_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.plate_face_cache TO authenticated;
GRANT ALL ON public.plate_face_cache TO service_role;

ALTER TABLE public.plate_face_cache ENABLE ROW LEVEL SECURITY;

-- Only edge functions (service_role) read/write this cache; no end-user access needed.
CREATE POLICY "service role manages plate face cache"
  ON public.plate_face_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS plate_face_cache_expires_idx ON public.plate_face_cache(expires_at);