ALTER TABLE public.syncso_dispatch_log
  ADD COLUMN IF NOT EXISTS motion_verdict text,
  ADD COLUMN IF NOT EXISTS motion_score numeric,
  ADD COLUMN IF NOT EXISTS motion_probe_meta jsonb;

CREATE INDEX IF NOT EXISTS idx_syncso_dispatch_log_motion_verdict
  ON public.syncso_dispatch_log (scene_id, created_at DESC)
  WHERE motion_verdict IS NOT NULL;