-- Wallets für alle User erstellen, die noch keins haben
INSERT INTO wallets (user_id, balance, plan_code, monthly_credits, last_reset_at)
SELECT 
  p.id,
  CASE 
    WHEN p.plan = 'free' THEN 100
    WHEN p.plan = 'basic' THEN 1500
    WHEN p.plan = 'pro' THEN 10000
    ELSE 100
  END as balance,
  COALESCE(p.plan, 'free') as plan_code,
  CASE 
    WHEN p.plan = 'free' THEN 100
    WHEN p.plan = 'basic' THEN 1500
    WHEN p.plan = 'pro' THEN 10000
    ELSE 100
  END as monthly_credits,
  now() as last_reset_at
FROM profiles p
LEFT JOIN wallets w ON w.user_id = p.id
WHERE w.user_id IS NULL;