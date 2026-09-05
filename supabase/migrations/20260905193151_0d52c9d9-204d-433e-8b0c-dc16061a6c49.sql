ALTER TABLE public.video_enhance_runs
  ADD COLUMN IF NOT EXISTS actual_units numeric,
  ADD COLUMN IF NOT EXISTS provider_retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS processing_seconds numeric;