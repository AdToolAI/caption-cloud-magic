
-- Table 1: system_config (single-row key-value config)
CREATE TABLE public.system_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read system_config"
ON public.system_config FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update system_config"
ON public.system_config FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert system_config"
ON public.system_config FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Seed default values
INSERT INTO public.system_config (key, value, description) VALUES
  ('lambda_max_concurrent', '6'::jsonb, 'Maximum parallel Lambda renders (Circuit Breaker can lower automatically)'),
  ('lambda_max_concurrent_safe', '3'::jsonb, 'Safe fallback value when Circuit Breaker trips'),
  ('lambda_circuit_breaker_threshold', '0.3'::jsonb, 'Failure rate threshold (0-1) to trip Circuit Breaker'),
  ('lambda_circuit_breaker_window_min', '10'::jsonb, 'Time window in minutes for Circuit Breaker analysis');

-- Table 2: lambda_health_metrics
CREATE TABLE public.lambda_health_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  render_id TEXT,
  job_id UUID,
  status TEXT NOT NULL CHECK (status IN ('success', 'failure', 'timeout', 'oom')),
  duration_ms INTEGER,
  memory_used_mb INTEGER,
  memory_limit_mb INTEGER,
  error_message TEXT,
  function_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lambda_health_created_at ON public.lambda_health_metrics(created_at DESC);
CREATE INDEX idx_lambda_health_status ON public.lambda_health_metrics(status, created_at DESC);

ALTER TABLE public.lambda_health_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read lambda_health_metrics"
ON public.lambda_health_metrics FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Table 3: provider_quota_log
CREATE TABLE public.provider_quota_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  endpoint TEXT,
  status_code INTEGER,
  success BOOLEAN NOT NULL DEFAULT true,
  response_time_ms INTEGER,
  rate_limit_remaining INTEGER,
  rate_limit_total INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_provider_quota_provider_time ON public.provider_quota_log(provider, created_at DESC);
CREATE INDEX idx_provider_quota_created_at ON public.provider_quota_log(created_at DESC);

ALTER TABLE public.provider_quota_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read provider_quota_log"
ON public.provider_quota_log FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Aggregated view for Provider Health Dashboard (last minute stats)
CREATE OR REPLACE VIEW public.provider_quota_stats_recent AS
SELECT
  provider,
  COUNT(*) AS requests_last_minute,
  COUNT(*) FILTER (WHERE success = true) AS successful_requests,
  COUNT(*) FILTER (WHERE success = false) AS failed_requests,
  AVG(response_time_ms)::INTEGER AS avg_response_time_ms,
  MAX(rate_limit_total) AS rate_limit_total,
  MIN(rate_limit_remaining) AS rate_limit_remaining_min,
  MAX(created_at) AS last_call_at
FROM public.provider_quota_log
WHERE created_at >= now() - INTERVAL '1 minute'
GROUP BY provider;

-- Lambda health summary view (last 10 min)
CREATE OR REPLACE VIEW public.lambda_health_recent AS
SELECT
  COUNT(*) AS total_renders,
  COUNT(*) FILTER (WHERE status = 'success') AS successful,
  COUNT(*) FILTER (WHERE status IN ('failure', 'timeout', 'oom')) AS failed,
  COUNT(*) FILTER (WHERE status = 'oom') AS oom_count,
  CASE WHEN COUNT(*) > 0
    THEN (COUNT(*) FILTER (WHERE status IN ('failure', 'timeout', 'oom')))::NUMERIC / COUNT(*)
    ELSE 0
  END AS failure_rate,
  AVG(duration_ms)::INTEGER AS avg_duration_ms,
  AVG(memory_used_mb)::INTEGER AS avg_memory_mb,
  MAX(memory_used_mb) AS peak_memory_mb
FROM public.lambda_health_metrics
WHERE created_at >= now() - INTERVAL '10 minutes';
