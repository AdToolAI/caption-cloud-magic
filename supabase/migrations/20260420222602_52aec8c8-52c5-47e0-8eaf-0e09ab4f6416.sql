-- Add test account flag to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_test_account BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_is_test_account 
ON public.profiles(is_test_account) 
WHERE is_test_account = true;

-- Table: ai_superuser_runs
CREATE TABLE IF NOT EXISTS public.ai_superuser_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pass', 'fail', 'warning', 'running')),
  latency_ms INTEGER,
  http_status INTEGER,
  error_message TEXT,
  response_schema_hash TEXT,
  credits_consumed NUMERIC DEFAULT 0,
  full_request_json JSONB,
  full_response_json JSONB,
  triggered_by TEXT NOT NULL DEFAULT 'cron' CHECK (triggered_by IN ('cron', 'manual', 'daily')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_superuser_runs_scenario ON public.ai_superuser_runs(scenario_name, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_superuser_runs_status ON public.ai_superuser_runs(status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_superuser_runs_started ON public.ai_superuser_runs(started_at DESC);

ALTER TABLE public.ai_superuser_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all superuser runs"
ON public.ai_superuser_runs FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can insert superuser runs"
ON public.ai_superuser_runs FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "Service role can update superuser runs"
ON public.ai_superuser_runs FOR UPDATE
TO service_role
USING (true);

-- Table: ai_superuser_anomalies
CREATE TABLE IF NOT EXISTS public.ai_superuser_anomalies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  pattern_description TEXT NOT NULL,
  affected_scenarios TEXT[] NOT NULL DEFAULT '{}',
  ai_analysis TEXT,
  metric_data JSONB,
  auto_bug_report_id UUID REFERENCES public.bug_reports(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_superuser_anomalies_severity ON public.ai_superuser_anomalies(severity, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_superuser_anomalies_unresolved ON public.ai_superuser_anomalies(detected_at DESC) WHERE resolved_at IS NULL;

ALTER TABLE public.ai_superuser_anomalies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all anomalies"
ON public.ai_superuser_anomalies FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update anomalies"
ON public.ai_superuser_anomalies FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can insert anomalies"
ON public.ai_superuser_anomalies FOR INSERT
TO service_role
WITH CHECK (true);