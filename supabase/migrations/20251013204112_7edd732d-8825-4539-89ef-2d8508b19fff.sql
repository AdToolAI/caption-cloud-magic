-- Phase 1: Datenbank-Credits korrigieren

-- 1. billing_plans Tabelle korrigieren
UPDATE billing_plans
SET monthly_credits = 100
WHERE code = 'free';

UPDATE billing_plans
SET monthly_credits = 1500
WHERE code = 'basic';

UPDATE billing_plans
SET monthly_credits = 10000
WHERE code = 'pro';

-- 2. Bestehende Wallets aktualisieren (falls User Basic/Pro hätten)
UPDATE wallets
SET monthly_credits = 1500, balance = 1500, updated_at = now()
WHERE plan_code = 'basic';

UPDATE wallets
SET monthly_credits = 10000, balance = 10000, updated_at = now()
WHERE plan_code = 'pro';

-- Free-User behalten ihre 100 Credits (schon korrekt)