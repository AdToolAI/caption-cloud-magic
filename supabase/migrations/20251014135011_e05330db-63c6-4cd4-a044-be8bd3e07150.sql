-- Fix infinite recursion in workspace_members RLS policies using security definer functions

-- Drop existing problematic policies on workspace_members
DROP POLICY IF EXISTS "Workspace members can view members" ON workspace_members;
DROP POLICY IF EXISTS "Workspace admins can manage members" ON workspace_members;
DROP POLICY IF EXISTS "Users can view their own membership" ON workspace_members;
DROP POLICY IF EXISTS "Users can view own workspace memberships" ON workspace_members;
DROP POLICY IF EXISTS "Workspace owners can view all members" ON workspace_members;
DROP POLICY IF EXISTS "Workspace owners can manage members" ON workspace_members;

-- Create security definer function to check if user is workspace owner
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

-- Create security definer function to check if user is workspace member
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

-- Create new non-recursive policies for workspace_members
CREATE POLICY "Users can view own memberships"
  ON workspace_members FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Workspace owners can view members"
  ON workspace_members FOR SELECT
  USING (public.is_workspace_owner(workspace_id, auth.uid()));

CREATE POLICY "Workspace owners can insert members"
  ON workspace_members FOR INSERT
  WITH CHECK (public.is_workspace_owner(workspace_id, auth.uid()));

CREATE POLICY "Workspace owners can update members"
  ON workspace_members FOR UPDATE
  USING (public.is_workspace_owner(workspace_id, auth.uid()));

CREATE POLICY "Workspace owners can delete members"
  ON workspace_members FOR DELETE
  USING (public.is_workspace_owner(workspace_id, auth.uid()));

-- Fix workspaces table policies
DROP POLICY IF EXISTS "Users can view workspaces they own" ON workspaces;
DROP POLICY IF EXISTS "Users can view workspaces they are members of" ON workspaces;
DROP POLICY IF EXISTS "Users can view own workspaces" ON workspaces;
DROP POLICY IF EXISTS "Users can view member workspaces" ON workspaces;
DROP POLICY IF EXISTS "Workspace owners can update own workspaces" ON workspaces;
DROP POLICY IF EXISTS "Workspace owners can delete own workspaces" ON workspaces;

-- Create simple workspace policies
CREATE POLICY "Users view owned workspaces"
  ON workspaces FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "Users view member workspaces"
  ON workspaces FOR SELECT
  USING (public.is_workspace_member_func(id, auth.uid()));

CREATE POLICY "Owners update workspaces"
  ON workspaces FOR UPDATE
  USING (owner_id = auth.uid());

CREATE POLICY "Owners delete workspaces"
  ON workspaces FOR DELETE
  USING (owner_id = auth.uid());

CREATE POLICY "Users insert workspaces"
  ON workspaces FOR INSERT
  WITH CHECK (owner_id = auth.uid());