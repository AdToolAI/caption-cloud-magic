-- Setze test_mode_plan auf 'enterprise' für dusatkojr@web.de
UPDATE profiles 
SET test_mode_plan = 'enterprise',
    updated_at = now()
WHERE email = 'dusatkojr@web.de';

-- Update Wallet für Enterprise Plan (unbegrenzte Credits)
UPDATE wallets
SET plan_code = 'enterprise',
    monthly_credits = 999999,
    balance = 999999,
    updated_at = now()
WHERE user_id IN (
  SELECT id FROM profiles WHERE email = 'dusatkojr@web.de'
);
