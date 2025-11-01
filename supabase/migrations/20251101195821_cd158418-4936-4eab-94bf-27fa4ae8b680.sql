-- Update storage quotas based on current user plans
-- Free: 1 GB (1024 MB), Basic: 2 GB (2048 MB), Pro: 5 GB (5120 MB), Enterprise: 10 GB (10240 MB)

-- Update existing user storage quotas based on their current plan
UPDATE user_storage us
SET quota_mb = CASE 
  WHEN w.plan_code = 'basic' THEN 2048
  WHEN w.plan_code = 'pro' THEN 5120
  WHEN w.plan_code = 'enterprise' THEN 10240
  WHEN w.plan_code = 'free' THEN 1024
  ELSE 1024 -- Default to 1 GB for any unknown plan
END,
updated_at = now()
FROM wallets w
WHERE us.user_id = w.user_id;

-- Create or replace trigger function to auto-update quota on plan change
CREATE OR REPLACE FUNCTION update_storage_quota_on_plan_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE user_storage
  SET quota_mb = CASE 
    WHEN NEW.plan_code = 'basic' THEN 2048
    WHEN NEW.plan_code = 'pro' THEN 5120
    WHEN NEW.plan_code = 'enterprise' THEN 10240
    WHEN NEW.plan_code = 'free' THEN 1024
    ELSE 1024
  END,
  updated_at = now()
  WHERE user_id = NEW.user_id;
  
  RETURN NEW;
END;
$$;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS on_wallet_plan_change ON wallets;

-- Create trigger on wallets table
CREATE TRIGGER on_wallet_plan_change
  AFTER UPDATE OF plan_code ON wallets
  FOR EACH ROW
  WHEN (OLD.plan_code IS DISTINCT FROM NEW.plan_code)
  EXECUTE FUNCTION update_storage_quota_on_plan_change();

-- Update the default quota for new users to 1 GB (1024 MB)
ALTER TABLE user_storage 
  ALTER COLUMN quota_mb SET DEFAULT 1024;