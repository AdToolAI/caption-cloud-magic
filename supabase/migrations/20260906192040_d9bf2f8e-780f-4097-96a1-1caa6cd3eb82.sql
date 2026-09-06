ALTER TABLE public.video_enhance_runs
  ADD COLUMN IF NOT EXISTS output_container text,
  ADD COLUMN IF NOT EXISTS output_mime_type text,
  ADD COLUMN IF NOT EXISTS output_fps numeric,
  ADD COLUMN IF NOT EXISTS output_duration_seconds numeric;