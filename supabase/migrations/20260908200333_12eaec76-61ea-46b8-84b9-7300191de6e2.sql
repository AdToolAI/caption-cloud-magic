ALTER TABLE public.video_enhance_runs
  ADD COLUMN IF NOT EXISTS cost_estimator_version text,
  ADD COLUMN IF NOT EXISTS estimated_provider_credits numeric,
  ADD COLUMN IF NOT EXISTS actual_provider_credits numeric,
  ADD COLUMN IF NOT EXISTS provider_credit_drift_pct numeric,
  ADD COLUMN IF NOT EXISTS provider_credit_drift_flagged boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cost_uncertainty_buffer numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS multiplier_band_min numeric,
  ADD COLUMN IF NOT EXISTS multiplier_band_max numeric,
  ADD COLUMN IF NOT EXISTS account_discount_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS charged_price_eur numeric,
  ADD COLUMN IF NOT EXISTS effective_multiple_after_discount numeric,
  ADD COLUMN IF NOT EXISTS profitability_class text,
  ADD COLUMN IF NOT EXISTS subsidy_eur numeric NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS video_enhance_runs_subsidized_idx
  ON public.video_enhance_runs (created_at DESC)
  WHERE profitability_class = 'subsidized';

CREATE INDEX IF NOT EXISTS video_enhance_runs_credit_drift_idx
  ON public.video_enhance_runs (created_at DESC)
  WHERE provider_credit_drift_flagged;