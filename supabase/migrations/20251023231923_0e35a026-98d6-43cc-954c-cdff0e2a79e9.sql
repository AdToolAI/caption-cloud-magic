-- Add enterprise fields to workspaces table
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS is_enterprise BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS member_seat_price NUMERIC DEFAULT 49.99,
  ADD COLUMN IF NOT EXISTS member_currency TEXT DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS max_members INTEGER DEFAULT 1;

-- Create workspace subscriptions tracking table
CREATE TABLE IF NOT EXISTS workspace_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT NOT NULL UNIQUE,
  stripe_customer_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  plan_type TEXT NOT NULL DEFAULT 'enterprise',
  base_seats INTEGER DEFAULT 1,
  additional_seats INTEGER DEFAULT 0,
  total_amount NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workspace_subscriptions_workspace ON workspace_subscriptions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_subscriptions_stripe_sub ON workspace_subscriptions(stripe_subscription_id);

-- Enable RLS on workspace_subscriptions
ALTER TABLE workspace_subscriptions ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if exists
DROP POLICY IF EXISTS "Workspace admins can view subscriptions" ON workspace_subscriptions;

-- Policy: Workspace owners and admins can view subscriptions
CREATE POLICY "Workspace admins can view subscriptions"
ON workspace_subscriptions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_members.workspace_id = workspace_subscriptions.workspace_id
    AND workspace_members.user_id = auth.uid()
    AND workspace_members.role IN ('owner', 'admin')
  )
);

-- Function to enforce single-user for non-enterprise workspaces
CREATE OR REPLACE FUNCTION enforce_single_user_non_enterprise()
RETURNS TRIGGER AS $$
DECLARE
  v_is_enterprise BOOLEAN;
  v_member_count INTEGER;
BEGIN
  -- Get workspace enterprise status
  SELECT is_enterprise INTO v_is_enterprise
  FROM workspaces
  WHERE id = NEW.workspace_id;
  
  -- If not enterprise, check member count
  IF NOT COALESCE(v_is_enterprise, false) THEN
    SELECT COUNT(*) INTO v_member_count
    FROM workspace_members
    WHERE workspace_id = NEW.workspace_id
    AND status = 'accepted';
    
    IF v_member_count >= 1 THEN
      RAISE EXCEPTION 'Only Enterprise workspaces can have multiple members. Upgrade to Enterprise to add team members.';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger
DROP TRIGGER IF EXISTS trg_single_user_non_enterprise ON workspace_members;
CREATE TRIGGER trg_single_user_non_enterprise
BEFORE INSERT ON workspace_members
FOR EACH ROW
EXECUTE FUNCTION enforce_single_user_non_enterprise();