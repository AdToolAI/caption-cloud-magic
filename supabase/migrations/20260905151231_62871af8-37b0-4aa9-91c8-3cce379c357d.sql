ALTER TABLE public.video_enhance_runs
  ADD COLUMN IF NOT EXISTS provider_cost_source TEXT NOT NULL DEFAULT 'unavailable',
  ADD COLUMN IF NOT EXISTS test_fail_persist_once BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.video_enhance_runs
  ADD CONSTRAINT video_enhance_runs_cost_source_chk
  CHECK (provider_cost_source IN ('prediction_metric','provider_usage','billing_record','manual_verified','unavailable'));