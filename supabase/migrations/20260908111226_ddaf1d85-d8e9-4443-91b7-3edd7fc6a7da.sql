CREATE TABLE public.ai_video_wallet_open_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  generation_id uuid,
  correction_key text NOT NULL UNIQUE,
  reason text NOT NULL,
  expected_amount_euros numeric(12,2) NOT NULL,
  recovered_amount_euros numeric(12,2) NOT NULL DEFAULT 0,
  open_amount_euros numeric(12,2) NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','settled','waived')),
  ledger_transaction_id uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ai_video_wallet_open_corrections TO service_role;
ALTER TABLE public.ai_video_wallet_open_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view open corrections" ON public.ai_video_wallet_open_corrections FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
GRANT SELECT ON public.ai_video_wallet_open_corrections TO authenticated;