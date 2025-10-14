-- Add 'enterprise' to allowed plan values
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_plan_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_plan_check CHECK (plan = ANY (ARRAY['free'::text, 'basic'::text, 'pro'::text, 'enterprise'::text]));