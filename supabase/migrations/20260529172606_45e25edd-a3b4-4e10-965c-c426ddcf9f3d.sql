
-- ============================================================
-- Stage F — Artlist-Level Reliability
-- F.3 Circuit Breaker + F.6 System Alerts + F.7 Auto-Tuner cfg
-- ============================================================

-- F.3 Provider Circuit Breaker State
CREATE TABLE IF NOT EXISTS public.provider_circuit_state (
  provider text PRIMARY KEY,
  state text NOT NULL DEFAULT 'closed' CHECK (state IN ('closed', 'open', 'half_open')),
  fail_count integer NOT NULL DEFAULT 0,
  opened_at timestamptz,
  half_open_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_error_class text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.provider_circuit_state TO authenticated;
GRANT ALL ON public.provider_circuit_state TO service_role;

ALTER TABLE public.provider_circuit_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins can read circuit state"
  ON public.provider_circuit_state
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Seed sync.so row so we never have a null-state path
INSERT INTO public.provider_circuit_state (provider, state)
VALUES ('sync.so', 'closed')
ON CONFLICT (provider) DO NOTHING;

-- F.3 Rolling failure window helper (last 5 min) used by the breaker
CREATE OR REPLACE FUNCTION public.syncso_recent_failure_count(_window_min integer DEFAULT 5)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int
  FROM public.syncso_dispatch_log
  WHERE created_at > now() - make_interval(mins => _window_min)
    AND error_class IN ('provider_unknown_error', 'timeout', 'rate_limited', 'http_5xx', 'auth')
    AND sync_status IN ('FAILED', 'REJECTED', 'CANCELED', 'DISPATCH_FAILED');
$$;

-- F.6 System Alerts (admin-visible, for schema-drift + circuit-open events)
CREATE TABLE IF NOT EXISTS public.system_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type text NOT NULL,
  severity text NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),
  source text NOT NULL,
  message text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  acknowledged boolean NOT NULL DEFAULT false,
  acknowledged_by uuid,
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_alerts_unack_created
  ON public.system_alerts (created_at DESC)
  WHERE acknowledged = false;

CREATE INDEX IF NOT EXISTS idx_system_alerts_type_created
  ON public.system_alerts (alert_type, created_at DESC);

GRANT SELECT, UPDATE ON public.system_alerts TO authenticated;
GRANT ALL ON public.system_alerts TO service_role;

ALTER TABLE public.system_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins can read system alerts"
  ON public.system_alerts
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins can ack system alerts"
  ON public.system_alerts
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- F.7 Auto-Tuner config seed (read by compose-dialog-segments)
INSERT INTO public.system_config (key, value, updated_at)
VALUES (
  'syncso.preferred_source_kind',
  jsonb_build_object('value', 'video2video', 'updated_by', 'seed', 'sample_size', 0),
  now()
)
ON CONFLICT (key) DO NOTHING;

-- Auto-Tuner last-run marker
INSERT INTO public.system_config (key, value, updated_at)
VALUES (
  'syncso.auto_tuner_last_run',
  jsonb_build_object('ts', null),
  now()
)
ON CONFLICT (key) DO NOTHING;
