
CREATE TABLE public.synthetic_probe_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  probe_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pass', 'fail', 'degraded')),
  latency_ms INTEGER NOT NULL DEFAULT 0,
  threshold_ms INTEGER,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  run_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_synthetic_probe_runs_name_time
  ON public.synthetic_probe_runs (probe_name, run_at DESC);

CREATE INDEX idx_synthetic_probe_runs_status_time
  ON public.synthetic_probe_runs (status, run_at DESC)
  WHERE status != 'pass';

ALTER TABLE public.synthetic_probe_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view probe runs"
  ON public.synthetic_probe_runs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Cleanup function: delete runs older than 30 days
CREATE OR REPLACE FUNCTION public.cleanup_synthetic_probe_runs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.synthetic_probe_runs
  WHERE run_at < now() - INTERVAL '30 days';
END;
$$;
