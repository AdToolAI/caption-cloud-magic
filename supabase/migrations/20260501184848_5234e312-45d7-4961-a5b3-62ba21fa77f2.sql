CREATE TABLE IF NOT EXISTS public.founders_signups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT UNIQUE,
  coupon_id TEXT NOT NULL CHECK (coupon_id IN ('PRO-FOUNDERS-24M','PRO-LAUNCH-3M')),
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_founders_signups_coupon ON public.founders_signups(coupon_id);
CREATE INDEX IF NOT EXISTS idx_founders_signups_user ON public.founders_signups(user_id);

ALTER TABLE public.founders_signups ENABLE ROW LEVEL SECURITY;

-- Nobody can directly insert/update/delete via the API (only edge functions via service role)
CREATE POLICY "founders_signups_no_client_writes_insert"
  ON public.founders_signups FOR INSERT TO authenticated
  WITH CHECK (false);
CREATE POLICY "founders_signups_no_client_writes_update"
  ON public.founders_signups FOR UPDATE TO authenticated
  USING (false);
CREATE POLICY "founders_signups_no_client_writes_delete"
  ON public.founders_signups FOR DELETE TO authenticated
  USING (false);

-- Users can see their own row only (privacy)
CREATE POLICY "founders_signups_own_select"
  ON public.founders_signups FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Public count function (for UI badge "X / 1000 Founders-Slots claimed")
CREATE OR REPLACE FUNCTION public.count_founders_claimed()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int FROM public.founders_signups
  WHERE coupon_id = 'PRO-FOUNDERS-24M';
$$;

GRANT EXECUTE ON FUNCTION public.count_founders_claimed() TO anon, authenticated;