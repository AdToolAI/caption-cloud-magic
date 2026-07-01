
ALTER TABLE public.universal_video_renders
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS frames_total integer,
  ADD COLUMN IF NOT EXISTS frames_per_lambda integer,
  ADD COLUMN IF NOT EXISTS workers_used integer,
  ADD COLUMN IF NOT EXISTS lambda_duration_ms integer,
  ADD COLUMN IF NOT EXISTS preflight_ms integer,
  ADD COLUMN IF NOT EXISTS total_duration_ms integer,
  ADD COLUMN IF NOT EXISTS cold_start boolean,
  ADD COLUMN IF NOT EXISTS started_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS idx_universal_video_renders_status_created
  ON public.universal_video_renders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_universal_video_renders_aspect_status
  ON public.universal_video_renders (aspect_ratio, status);
