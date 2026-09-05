CREATE TABLE public.video_enhance_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  idempotency_key TEXT NOT NULL,

  -- configuration
  model_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  resolution TEXT NOT NULL,
  fps INTEGER NOT NULL,
  tier TEXT NOT NULL,

  -- server-measured source facts (never taken from the client)
  source_asset_id UUID,
  source_url TEXT NOT NULL,
  source_duration_seconds NUMERIC NOT NULL,
  source_width INTEGER NOT NULL,
  source_height INTEGER NOT NULL,
  source_fps NUMERIC NOT NULL,
  source_container TEXT,
  source_size_bytes BIGINT,
  source_model TEXT,

  -- frozen price snapshot (prediction)
  currency TEXT NOT NULL DEFAULT 'EUR',
  pricing_version TEXT NOT NULL,
  provider_pricing_version TEXT NOT NULL,
  rate_card_version TEXT NOT NULL,
  provider_cost_usd_estimated NUMERIC NOT NULL,
  provider_cost_eur_buffered NUMERIC NOT NULL,
  fx_rate_used NUMERIC NOT NULL,
  fx_safety_buffer_used NUMERIC NOT NULL,
  multiplier_used NUMERIC,
  user_price_eur NUMERIC NOT NULL,
  net_revenue_eur NUMERIC,
  contribution_eur NUMERIC,
  margin_pct NUMERIC,
  credits_reserved NUMERIC NOT NULL DEFAULT 0,

  -- actuals
  provider_cost_usd_actual NUMERIC,
  actual_contribution_eur NUMERIC,
  actual_margin_pct NUMERIC,
  cost_drift_ratio NUMERIC,

  -- lifecycle
  status TEXT NOT NULL DEFAULT 'created',
  error_code TEXT,
  error_message TEXT,
  cancel_requested_at TIMESTAMPTZ,

  -- provider bookkeeping
  callback_token TEXT NOT NULL,
  submit_lease_owner TEXT,
  submit_lease_expires_at TIMESTAMPTZ,
  provider_prediction_id TEXT,
  provider_status TEXT,
  provider_output_url TEXT,
  provider_submitted_at TIMESTAMPTZ,
  provider_completed_at TIMESTAMPTZ,

  -- staging + result
  staging_key TEXT,
  output_asset_id UUID,
  output_url TEXT,
  persist_attempts INTEGER NOT NULL DEFAULT 0,

  -- reconciliation
  reconciliation_attempts INTEGER NOT NULL DEFAULT 0,
  last_reconciled_at TIMESTAMPTZ,
  next_reconcile_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX video_enhance_runs_user_idem_key
  ON public.video_enhance_runs (user_id, idempotency_key);
CREATE UNIQUE INDEX video_enhance_runs_callback_token_key
  ON public.video_enhance_runs (callback_token);
CREATE UNIQUE INDEX video_enhance_runs_prediction_key
  ON public.video_enhance_runs (provider_prediction_id)
  WHERE provider_prediction_id IS NOT NULL;
CREATE INDEX video_enhance_runs_user_created_idx
  ON public.video_enhance_runs (user_id, created_at DESC);
CREATE INDEX video_enhance_runs_reconcile_idx
  ON public.video_enhance_runs (next_reconcile_at)
  WHERE next_reconcile_at IS NOT NULL;

GRANT SELECT ON public.video_enhance_runs TO authenticated;
GRANT ALL ON public.video_enhance_runs TO service_role;
ALTER TABLE public.video_enhance_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own enhance runs"
  ON public.video_enhance_runs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);


CREATE TABLE public.video_enhance_ledger (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES public.video_enhance_runs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('reserve', 'capture', 'release')),
  operation_key TEXT NOT NULL,
  amount_eur NUMERIC NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX video_enhance_ledger_operation_key
  ON public.video_enhance_ledger (operation_key);

GRANT ALL ON public.video_enhance_ledger TO service_role;
ALTER TABLE public.video_enhance_ledger ENABLE ROW LEVEL SECURITY;


CREATE TABLE public.video_enhance_admin_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES public.video_enhance_runs(id) ON DELETE CASCADE,
  admin_user_id UUID NOT NULL,
  action TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.video_enhance_admin_actions TO authenticated;
GRANT ALL ON public.video_enhance_admin_actions TO service_role;
ALTER TABLE public.video_enhance_admin_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view enhance admin actions"
  ON public.video_enhance_admin_actions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));


CREATE TRIGGER update_video_enhance_runs_updated_at
  BEFORE UPDATE ON public.video_enhance_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();