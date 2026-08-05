ALTER TABLE public.promo_codes
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'subscription_discount',
  ADD COLUMN IF NOT EXISTS benefit_label_de text,
  ADD COLUMN IF NOT EXISTS benefit_label_en text,
  ADD COLUMN IF NOT EXISTS benefit_label_es text;

CREATE TABLE IF NOT EXISTS public.promo_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  promo_code_id uuid NOT NULL REFERENCES public.promo_codes(id) ON DELETE CASCADE,
  code text NOT NULL,
  status text NOT NULL DEFAULT 'reserved',
  stripe_session_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS promo_redemptions_user_unique ON public.promo_redemptions(user_id);
CREATE INDEX IF NOT EXISTS promo_redemptions_code_idx ON public.promo_redemptions(promo_code_id);

GRANT SELECT ON public.promo_redemptions TO authenticated;
GRANT ALL ON public.promo_redemptions TO service_role;

ALTER TABLE public.promo_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own redemptions" ON public.promo_redemptions;
CREATE POLICY "Users read own redemptions"
  ON public.promo_redemptions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role full access on promo_redemptions" ON public.promo_redemptions;
CREATE POLICY "Service role full access on promo_redemptions"
  ON public.promo_redemptions FOR ALL TO service_role
  USING (true) WITH CHECK (true);