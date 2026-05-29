-- Stage G — F.1 Master-Video Normalization Cache + F.4 Face Quality Score

-- F.1: Normalized master video cache (7d TTL)
CREATE TABLE IF NOT EXISTS public.normalized_master_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_url TEXT NOT NULL,
  source_codec TEXT,
  source_width INT,
  source_height INT,
  source_fps NUMERIC,
  normalized_url TEXT NOT NULL,
  normalized_codec TEXT NOT NULL DEFAULT 'h264',
  normalized_width INT NOT NULL DEFAULT 1080,
  normalized_height INT NOT NULL DEFAULT 1920,
  normalized_fps INT NOT NULL DEFAULT 30,
  bytes BIGINT,
  duration_sec NUMERIC,
  provider TEXT NOT NULL DEFAULT 'replicate-ffmpeg',
  provider_job_id TEXT,
  status TEXT NOT NULL DEFAULT 'completed', -- 'pending' | 'completed' | 'failed'
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days')
);

GRANT SELECT ON public.normalized_master_cache TO authenticated;
GRANT ALL ON public.normalized_master_cache TO service_role;

ALTER TABLE public.normalized_master_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role manages normalized_master_cache"
ON public.normalized_master_cache FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE POLICY "authenticated read normalized_master_cache"
ON public.normalized_master_cache FOR SELECT TO authenticated
USING (true);

CREATE UNIQUE INDEX IF NOT EXISTS idx_normalized_master_source_url
  ON public.normalized_master_cache(source_url);
CREATE INDEX IF NOT EXISTS idx_normalized_master_expires
  ON public.normalized_master_cache(expires_at);

-- F.4: Add face-quality columns to existing frame_face_cache (no-op if columns already exist)
ALTER TABLE public.frame_face_cache
  ADD COLUMN IF NOT EXISTS face_score NUMERIC,
  ADD COLUMN IF NOT EXISTS yaw_degrees NUMERIC,
  ADD COLUMN IF NOT EXISTS pitch_degrees NUMERIC,
  ADD COLUMN IF NOT EXISTS eye_open_score NUMERIC,
  ADD COLUMN IF NOT EXISTS sharpness_score NUMERIC;

CREATE INDEX IF NOT EXISTS idx_frame_face_cache_score
  ON public.frame_face_cache(face_score)
  WHERE face_score IS NOT NULL;