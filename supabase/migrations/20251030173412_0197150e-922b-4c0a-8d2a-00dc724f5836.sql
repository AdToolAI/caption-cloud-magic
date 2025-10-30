-- Affiliates System Tables for Pricing v2.1

-- 1. Affiliates Table
CREATE TABLE IF NOT EXISTS public.affiliates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  payout_type TEXT CHECK (payout_type IN ('stripe_connect', 'manual')) DEFAULT 'manual',
  stripe_account_id TEXT,
  status TEXT CHECK (status IN ('active', 'inactive', 'suspended')) DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Promotion Codes Table
CREATE TABLE IF NOT EXISTS public.promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  affiliate_id UUID REFERENCES public.affiliates(id) ON DELETE CASCADE,
  stripe_promo_id TEXT NOT NULL,
  discount_percent INTEGER CHECK (discount_percent BETWEEN 1 AND 100) DEFAULT 30,
  duration_months INTEGER DEFAULT 3,
  max_redemptions INTEGER,
  redemptions_count INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Referrals Table
CREATE TABLE IF NOT EXISTS public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID REFERENCES public.affiliates(id) ON DELETE CASCADE NOT NULL,
  customer_id TEXT NOT NULL,
  subscription_id TEXT NOT NULL,
  promo_code_id UUID REFERENCES public.promo_codes(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  status TEXT CHECK (status IN ('active', 'expired', 'cancelled')) DEFAULT 'active'
);

-- 4. Payouts Table
CREATE TABLE IF NOT EXISTS public.payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID REFERENCES public.affiliates(id) ON DELETE CASCADE NOT NULL,
  referral_id UUID REFERENCES public.referrals(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  currency TEXT CHECK (currency IN ('EUR', 'USD')) DEFAULT 'EUR',
  invoice_id TEXT,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT CHECK (status IN ('accrued', 'pending', 'paid', 'failed')) DEFAULT 'accrued',
  stripe_transfer_id TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Enable RLS
ALTER TABLE public.affiliates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies (Admin-only for now)
-- These will be extended later with proper user roles
CREATE POLICY "Service role full access on affiliates"
  ON public.affiliates FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role full access on promo_codes"
  ON public.promo_codes FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role full access on referrals"
  ON public.referrals FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role full access on payouts"
  ON public.payouts FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- Public read access to promo_codes for validation
CREATE POLICY "Public can validate promo codes"
  ON public.promo_codes FOR SELECT
  USING (active = true);

-- 7. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON public.promo_codes(code);
CREATE INDEX IF NOT EXISTS idx_promo_codes_affiliate ON public.promo_codes(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_referrals_customer ON public.referrals(customer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_affiliate ON public.referrals(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_payouts_affiliate ON public.payouts(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_payouts_status ON public.payouts(status);

-- 8. Updated_at trigger for affiliates
CREATE OR REPLACE FUNCTION update_affiliates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_affiliates_updated_at
  BEFORE UPDATE ON public.affiliates
  FOR EACH ROW
  EXECUTE FUNCTION update_affiliates_updated_at();