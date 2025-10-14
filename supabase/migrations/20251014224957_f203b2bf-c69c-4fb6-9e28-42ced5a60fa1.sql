-- Drop existing faulty policies on workspace_members
DROP POLICY IF EXISTS "Workspace members can view members" ON public.workspace_members;
DROP POLICY IF EXISTS "Workspace owners can manage members" ON public.workspace_members;

-- Create new recursion-free policies
CREATE POLICY "Users can view own membership"
  ON public.workspace_members
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Workspace owners can view all members"
  ON public.workspace_members
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = workspace_members.workspace_id
      AND w.owner_id = auth.uid()
    )
  );

CREATE POLICY "Workspace owners can manage members"
  ON public.workspace_members
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = workspace_members.workspace_id
      AND w.owner_id = auth.uid()
    )
  );

-- Improve workspace creation trigger to add owner as member
CREATE OR REPLACE FUNCTION public.create_default_workspace()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
BEGIN
  -- Create default workspace
  INSERT INTO public.workspaces (owner_id, name, description)
  VALUES (
    NEW.id,
    'Mein Workspace',
    'Standard Workspace für Kalender und Team-Kollaboration'
  )
  RETURNING id INTO v_workspace_id;
  
  -- Add owner as member
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (v_workspace_id, NEW.id, 'owner');
  
  RETURN NEW;
END;
$$;

-- Fix existing workspaces: add owners as members if not already present
INSERT INTO public.workspace_members (workspace_id, user_id, role)
SELECT w.id, w.owner_id, 'owner'::team_role
FROM public.workspaces w
WHERE NOT EXISTS (
  SELECT 1 FROM public.workspace_members wm
  WHERE wm.workspace_id = w.id AND wm.user_id = w.owner_id
);