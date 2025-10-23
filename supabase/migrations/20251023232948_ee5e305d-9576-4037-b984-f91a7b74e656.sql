-- Activate trigger to enforce single-user workspaces for non-Enterprise plans
-- This prevents non-Enterprise workspaces from having multiple members

DROP TRIGGER IF EXISTS trg_single_user_non_enterprise ON workspace_members;

CREATE TRIGGER trg_single_user_non_enterprise
  BEFORE INSERT ON workspace_members
  FOR EACH ROW
  EXECUTE FUNCTION enforce_single_user_non_enterprise();