-- Fix 1: Wallets für alle bestehenden User erstellen (one-time)
INSERT INTO public.wallets (user_id, balance, plan_code, monthly_credits)
SELECT 
  u.id,
  CASE COALESCE(p.plan, 'free')
    WHEN 'basic' THEN 1500
    WHEN 'pro' THEN 10000
    ELSE 100
  END,
  COALESCE(p.plan, 'free'),
  CASE COALESCE(p.plan, 'free')
    WHEN 'basic' THEN 1500
    WHEN 'pro' THEN 10000
    ELSE 100
  END
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE NOT EXISTS (
  SELECT 1 FROM public.wallets w WHERE w.user_id = u.id
)
ON CONFLICT (user_id) DO NOTHING;

-- Fix 3: Atomare Credit-Abzug-Funktion
CREATE OR REPLACE FUNCTION public.deduct_credits(
  p_user_id UUID,
  p_amount INTEGER
)
RETURNS TABLE(new_balance INTEGER, success BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance INTEGER;
BEGIN
  UPDATE public.wallets
  SET balance = balance - p_amount, updated_at = now()
  WHERE user_id = p_user_id
    AND balance >= p_amount
  RETURNING balance INTO v_new_balance;
  
  IF v_new_balance IS NOT NULL THEN
    RETURN QUERY SELECT v_new_balance, true;
  ELSE
    RETURN QUERY SELECT 0, false;
  END IF;
END;
$$;

-- Fix 4: user_credit_transactions Tabelle erstellen
CREATE TABLE IF NOT EXISTS public.user_credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  amount INTEGER NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('debit', 'credit', 'refund')),
  feature_code TEXT,
  reservation_id UUID REFERENCES public.credit_reservations(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_credit_tx_user_created 
ON public.user_credit_transactions(user_id, created_at DESC);

ALTER TABLE public.user_credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own credit transactions"
  ON public.user_credit_transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert credit transactions"
  ON public.user_credit_transactions FOR INSERT
  WITH CHECK (true);