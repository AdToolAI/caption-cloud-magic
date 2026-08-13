ALTER TABLE public.composer_pipeline_jobs
  ADD COLUMN IF NOT EXISTS callback_delivery_status TEXT;

ALTER TABLE public.composer_pipeline_jobs
  DROP CONSTRAINT IF EXISTS composer_pipeline_jobs_delivery_status_check,
  ADD CONSTRAINT composer_pipeline_jobs_delivery_status_check
    CHECK (callback_delivery_status IS NULL OR callback_delivery_status IN (
      'received','processing','succeeded','failed_redeliverable'
    ));

CREATE INDEX IF NOT EXISTS idx_composer_pipeline_jobs_delivery
  ON public.composer_pipeline_jobs (run_id, stage, callback_delivery_status)
  WHERE callback_delivery_status IS NOT NULL;