-- Fix enforce_single_user_non_enterprise function
-- Remove reference to non-existent 'status' column in workspace_members table
CREATE OR REPLACE FUNCTION public.enforce_single_user_non_enterprise()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    WHERE workspace_id = NEW.workspace_id;
    -- Removed: AND status = 'accepted' (column does not exist)
    
    IF v_member_count >= 1 THEN
      RAISE EXCEPTION 'Only Enterprise workspaces can have multiple members. Upgrade to Enterprise to add team members.';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Recreate trigger with corrected function
DROP TRIGGER IF EXISTS trg_single_user_non_enterprise ON workspace_members;
CREATE TRIGGER trg_single_user_non_enterprise
  BEFORE INSERT ON workspace_members
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_single_user_non_enterprise();