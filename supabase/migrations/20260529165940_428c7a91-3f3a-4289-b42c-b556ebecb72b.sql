-- Stage E: Sync.so concurrency + video-stream probe cache

-- E.3: in-flight job tracker for concurrency guard
CREATE TABLE IF NOT EXISTS public.syncso_inflight_jobs (
  job_id TEXT PRIMARY KEY,
  user_id UUID,
  scene_id UUID,
  engine TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '15 minutes')
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.syncso_inflight_jobs TO authenticated;
GRANT ALL ON public.syncso_inflight_jobs TO service_role;

ALTER TABLE public.syncso_inflight_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "syncso_inflight_admin_select"
  ON public.syncso_inflight_jobs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS syncso_inflight_started_at_idx
  ON public.syncso_inflight_jobs (started_at DESC);
CREATE INDEX IF NOT EXISTS syncso_inflight_expires_at_idx
  ON public.syncso_inflight_jobs (expires_at);

-- E.2: video stream probe cache (24h TTL)
CREATE TABLE IF NOT EXISTS public.video_stream_probe_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_url TEXT NOT NULL UNIQUE,
  codec TEXT,
  width INTEGER,
  height INTEGER,
  fps NUMERIC,
  duration_sec NUMERIC,
  has_audio_track BOOLEAN,
  raw_meta JSONB,
  probed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_stream_probe_cache TO authenticated;
GRANT ALL ON public.video_stream_probe_cache TO service_role;

ALTER TABLE public.video_stream_probe_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "video_stream_probe_admin_select"
  ON public.video_stream_probe_cache
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS video_stream_probe_probed_at_idx
  ON public.video_stream_probe_cache (probed_at DESC);