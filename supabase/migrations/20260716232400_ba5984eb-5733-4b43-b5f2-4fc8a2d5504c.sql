ALTER TABLE public.syncso_dispatch_log
  ADD COLUMN IF NOT EXISTS meta_yavg_probe jsonb;

CREATE INDEX IF NOT EXISTS idx_syncso_dispatch_log_scene_job
  ON public.syncso_dispatch_log (scene_id, job_id);