-- Deep Sweep Runs
CREATE TABLE public.qa_deep_sweep_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed','aborted')),
  cap_eur NUMERIC(10,2) NOT NULL DEFAULT 50.00,
  total_cost_eur NUMERIC(10,4) NOT NULL DEFAULT 0,
  flows_total INT NOT NULL DEFAULT 0,
  flows_succeeded INT NOT NULL DEFAULT 0,
  flows_failed INT NOT NULL DEFAULT 0,
  flows_skipped INT NOT NULL DEFAULT 0,
  triggered_by UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_qa_deep_sweep_runs_started ON public.qa_deep_sweep_runs(started_at DESC);

-- Per-Flow Ergebnisse
CREATE TABLE public.qa_deep_sweep_flow_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES public.qa_deep_sweep_runs(id) ON DELETE CASCADE,
  flow_name TEXT NOT NULL,
  flow_index INT NOT NULL,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  duration_ms INT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','success','failed','timeout','budget_skipped')),
  estimated_cost_eur NUMERIC(10,4) NOT NULL DEFAULT 0,
  actual_cost_eur NUMERIC(10,4) NOT NULL DEFAULT 0,
  output_url TEXT,
  error_message TEXT,
  stage_log JSONB NOT NULL DEFAULT '[]'::jsonb,
  validation_checks JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_qa_deep_sweep_flow_results_run ON public.qa_deep_sweep_flow_results(run_id);

-- RLS
ALTER TABLE public.qa_deep_sweep_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qa_deep_sweep_flow_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read deep sweep runs"
ON public.qa_deep_sweep_runs FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert deep sweep runs"
ON public.qa_deep_sweep_runs FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update deep sweep runs"
ON public.qa_deep_sweep_runs FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete deep sweep runs"
ON public.qa_deep_sweep_runs FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can read deep sweep flow results"
ON public.qa_deep_sweep_flow_results FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert deep sweep flow results"
ON public.qa_deep_sweep_flow_results FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update deep sweep flow results"
ON public.qa_deep_sweep_flow_results FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));