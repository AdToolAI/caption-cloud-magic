-- Ensure workspaces table exists with proper structure
CREATE TABLE IF NOT EXISTS public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on workspaces
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

-- Workspace policies
CREATE POLICY "Users can view own workspaces"
  ON public.workspaces
  FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can create own workspaces"
  ON public.workspaces
  FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own workspaces"
  ON public.workspaces
  FOR UPDATE
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete own workspaces"
  ON public.workspaces
  FOR DELETE
  USING (auth.uid() = owner_id);

-- Ensure workspace_members table exists
CREATE TABLE IF NOT EXISTS public.workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role team_role NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(workspace_id, user_id)
);

-- Enable RLS on workspace_members
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

-- Workspace members policies
CREATE POLICY "Workspace members can view members"
  ON public.workspace_members
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_members.workspace_id
      AND wm.user_id = auth.uid()
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

-- Function to create default workspace for new users
CREATE OR REPLACE FUNCTION public.create_default_workspace()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Create default workspace
  INSERT INTO public.workspaces (owner_id, name, description)
  VALUES (
    NEW.id,
    'Mein Workspace',
    'Standard Workspace für Kalender und Team-Kollaboration'
  );
  
  RETURN NEW;
END;
$$;

-- Trigger to auto-create workspace on user signup
DROP TRIGGER IF EXISTS on_auth_user_created_workspace ON auth.users;
CREATE TRIGGER on_auth_user_created_workspace
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.create_default_workspace();

-- Create workspace for existing user (bestofproducts4u@gmail.com)
DO $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Get user ID
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = 'bestofproducts4u@gmail.com';
  
  -- Only create if user exists and doesn't have a workspace yet
  IF v_user_id IS NOT NULL THEN
    INSERT INTO public.workspaces (owner_id, name, description)
    SELECT 
      v_user_id,
      'Mein Workspace',
      'Standard Workspace für Kalender und Team-Kollaboration'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.workspaces WHERE owner_id = v_user_id
    );
    
    -- Add owner as member with owner role
    INSERT INTO public.workspace_members (workspace_id, user_id, role)
    SELECT 
      w.id,
      v_user_id,
      'owner'::team_role
    FROM public.workspaces w
    WHERE w.owner_id = v_user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.workspace_members 
      WHERE workspace_id = w.id AND user_id = v_user_id
    );
  END IF;
END $$;