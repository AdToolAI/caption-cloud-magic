-- Heartbeat tracking for scheduled background jobs
CREATE TABLE IF NOT EXISTS public.cron_heartbeats (
  job_name TEXT PRIMARY KEY,
  last_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_status TEXT NOT NULL DEFAULT 'ok' CHECK (last_status IN ('ok','error','warn')),
  last_error TEXT,
  last_duration_ms INTEGER,
  expected_interval_seconds INTEGER NOT NULL DEFAULT 300,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cron_heartbeats ENABLE ROW LEVEL SECURITY;

-- Only admins can read heartbeats; writes only via service role (no RLS write policy = blocked for clients)
CREATE POLICY "Admins can view heartbeats"
  ON public.cron_heartbeats
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_cron_heartbeats_last_run_at ON public.cron_heartbeats (last_run_at DESC);

-- Watchdog run log for the cockpit
CREATE TABLE IF NOT EXISTS public.qa_watchdog_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_ms INTEGER,
  anomalies_found INTEGER NOT NULL DEFAULT 0,
  bugs_created INTEGER NOT NULL DEFAULT 0,
  rows_auto_failed INTEGER NOT NULL DEFAULT 0,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.qa_watchdog_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view watchdog runs"
  ON public.qa_watchdog_runs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_qa_watchdog_runs_ran_at ON public.qa_watchdog_runs (ran_at DESC);