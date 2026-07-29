ALTER TABLE public.autopilot_productions
  ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS resume_attempts INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.autopilot_production_scenes
  ADD COLUMN IF NOT EXISTS attempt INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS fallback_kind TEXT;

CREATE INDEX IF NOT EXISTS idx_autopilot_productions_running_heartbeat
  ON public.autopilot_productions (status, heartbeat_at)
  WHERE status = 'running';