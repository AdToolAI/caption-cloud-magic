CREATE TABLE public.picture_enhance_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  model_id TEXT NOT NULL,
  studio_image_id UUID,
  scale INTEGER,
  currency TEXT NOT NULL DEFAULT 'EUR',
  pricing_mode TEXT NOT NULL,
  pricing_version TEXT NOT NULL,
  provider_pricing_version TEXT NOT NULL,
  provider_cost_usd_estimated NUMERIC(12,6) NOT NULL DEFAULT 0,
  provider_cost_eur_buffered NUMERIC(12,6) NOT NULL DEFAULT 0,
  fx_rate_used NUMERIC(10,6) NOT NULL,
  fx_safety_buffer_used NUMERIC(6,4) NOT NULL,
  multiplier_used NUMERIC(6,3),
  user_price_eur NUMERIC(12,4) NOT NULL,
  net_revenue_eur NUMERIC(12,6) NOT NULL,
  contribution_eur NUMERIC(12,6) NOT NULL,
  margin_pct NUMERIC(6,4) NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  refunded BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.picture_enhance_runs TO authenticated;
GRANT ALL ON public.picture_enhance_runs TO service_role;

ALTER TABLE public.picture_enhance_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own enhance runs"
ON public.picture_enhance_runs
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE INDEX idx_picture_enhance_runs_user_created
ON public.picture_enhance_runs (user_id, created_at DESC);

CREATE INDEX idx_picture_enhance_runs_model
ON public.picture_enhance_runs (model_id, created_at DESC);