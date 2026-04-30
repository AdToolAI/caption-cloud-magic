-- ============================================
-- QA Live Sweep Infrastructure
-- ============================================

-- Budget tracker (single-row table effectively, but supports historical periods)
CREATE TABLE public.qa_live_budget (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  cap_eur NUMERIC(10, 2) NOT NULL DEFAULT 20.00,
  spent_eur NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cap_non_negative CHECK (cap_eur >= 0),
  CONSTRAINT spent_non_negative CHECK (spent_eur >= 0)
);

ALTER TABLE public.qa_live_budget ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view budget"
  ON public.qa_live_budget FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update budget"
  ON public.qa_live_budget FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert budget"
  ON public.qa_live_budget FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed the initial budget row
INSERT INTO public.qa_live_budget (cap_eur, spent_eur) VALUES (20.00, 0.00);

-- Run results table
CREATE TABLE public.qa_live_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sweep_id UUID NOT NULL,
  provider TEXT NOT NULL,
  model TEXT,
  mode TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'skipped_budget', 'timeout')),
  cost_eur NUMERIC(10, 4) NOT NULL DEFAULT 0,
  estimated_cost_eur NUMERIC(10, 4) NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  asset_url TEXT,
  error_message TEXT,
  refund_verified BOOLEAN,
  raw_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE public.qa_live_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view runs"
  ON public.qa_live_runs FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert runs"
  ON public.qa_live_runs FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_qa_live_runs_sweep ON public.qa_live_runs(sweep_id, created_at DESC);
CREATE INDEX idx_qa_live_runs_provider ON public.qa_live_runs(provider, created_at DESC);

-- Trigger for updated_at on budget
CREATE TRIGGER update_qa_live_budget_updated_at
  BEFORE UPDATE ON public.qa_live_budget
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- Storage bucket for reusable test assets
-- ============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('qa-test-assets', 'qa-test-assets', false)
ON CONFLICT (id) DO NOTHING;

-- Only admins (and service role) can read/write test assets
CREATE POLICY "Admins can read qa-test-assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'qa-test-assets' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can write qa-test-assets"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'qa-test-assets' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update qa-test-assets"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'qa-test-assets' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete qa-test-assets"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'qa-test-assets' AND public.has_role(auth.uid(), 'admin'));