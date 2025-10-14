-- Drop ALL existing policies on workspace_members and workspaces
DO $$ 
DECLARE
    pol record;
BEGIN
    FOR pol IN 
        SELECT policyname FROM pg_policies 
        WHERE tablename = 'workspace_members' AND schemaname = 'public'
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || pol.policyname || '" ON workspace_members';
    END LOOP;
    
    FOR pol IN 
        SELECT policyname FROM pg_policies 
        WHERE tablename = 'workspaces' AND schemaname = 'public'
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || pol.policyname || '" ON workspaces';
    END LOOP;
END $$;

-- Create security definer functions to prevent recursion
CREATE OR REPLACE FUNCTION public.is_workspace_owner(_workspace_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspaces
    WHERE id = _workspace_id
    AND owner_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_workspace_member_func(_workspace_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = _workspace_id
    AND user_id = _user_id
  );
$$;

-- Create clean policies for workspace_members
CREATE POLICY "wm_view_own"
  ON workspace_members FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "wm_owner_view"
  ON workspace_members FOR SELECT
  USING (public.is_workspace_owner(workspace_id, auth.uid()));

CREATE POLICY "wm_owner_insert"
  ON workspace_members FOR INSERT
  WITH CHECK (public.is_workspace_owner(workspace_id, auth.uid()));

CREATE POLICY "wm_owner_update"
  ON workspace_members FOR UPDATE
  USING (public.is_workspace_owner(workspace_id, auth.uid()));

CREATE POLICY "wm_owner_delete"
  ON workspace_members FOR DELETE
  USING (public.is_workspace_owner(workspace_id, auth.uid()));

-- Create clean policies for workspaces
CREATE POLICY "ws_view_owned"
  ON workspaces FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "ws_view_member"
  ON workspaces FOR SELECT
  USING (public.is_workspace_member_func(id, auth.uid()));

CREATE POLICY "ws_update"
  ON workspaces FOR UPDATE
  USING (owner_id = auth.uid());

CREATE POLICY "ws_delete"
  ON workspaces FOR DELETE
  USING (owner_id = auth.uid());

CREATE POLICY "ws_insert"
  ON workspaces FOR INSERT
  WITH CHECK (owner_id = auth.uid());