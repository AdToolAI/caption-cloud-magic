ALTER TABLE public.video_enhance_runs
  ADD COLUMN IF NOT EXISTS effective_multiplier numeric,
  ADD COLUMN IF NOT EXISTS multiplier_cap numeric,
  ADD COLUMN IF NOT EXISTS pricing_gate text,
  ADD COLUMN IF NOT EXISTS pricing_gate_reason text,
  ADD COLUMN IF NOT EXISTS verified_effective_multiplier numeric,
  ADD COLUMN IF NOT EXISTS overcharge_refund_amount_eur numeric,
  ADD COLUMN IF NOT EXISTS overcharge_refund_at timestamptz;

ALTER TABLE public.video_enhance_ledger
  DROP CONSTRAINT IF EXISTS video_enhance_ledger_operation_check;

ALTER TABLE public.video_enhance_ledger
  ADD CONSTRAINT video_enhance_ledger_operation_check
  CHECK (operation = ANY (ARRAY['reserve'::text, 'capture'::text, 'release'::text, 'true_up_refund'::text]));