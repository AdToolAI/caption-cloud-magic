
CREATE TABLE IF NOT EXISTS public.qa_smoke_sweeps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  triggered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  category_filter TEXT,
  total INTEGER NOT NULL DEFAULT 0,
  pass_count INTEGER NOT NULL DEFAULT 0,
  fail_count INTEGER NOT NULL DEFAULT 0,
  skip_count INTEGER NOT NULL DEFAULT 0,
  timeout_count INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER
);

CREATE TABLE IF NOT EXISTS public.qa_smoke_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sweep_id UUID NOT NULL REFERENCES public.qa_smoke_sweeps(id) ON DELETE CASCADE,
  function_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'uncategorized',
  status TEXT NOT NULL CHECK (status IN ('pass','fail','skip','timeout')),
  status_code INTEGER,
  duration_ms INTEGER,
  error TEXT,
  response_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qa_smoke_runs_sweep ON public.qa_smoke_runs(sweep_id);
CREATE INDEX IF NOT EXISTS idx_qa_smoke_runs_function ON public.qa_smoke_runs(function_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qa_smoke_sweeps_started ON public.qa_smoke_sweeps(started_at DESC);

GRANT SELECT ON public.qa_smoke_sweeps TO authenticated;
GRANT ALL ON public.qa_smoke_sweeps TO service_role;
GRANT SELECT ON public.qa_smoke_runs TO authenticated;
GRANT ALL ON public.qa_smoke_runs TO service_role;

ALTER TABLE public.qa_smoke_sweeps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qa_smoke_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read smoke sweeps"
  ON public.qa_smoke_sweeps FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins read smoke runs"
  ON public.qa_smoke_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.qa_smoke_sweeps;
ALTER PUBLICATION supabase_realtime ADD TABLE public.qa_smoke_runs;
