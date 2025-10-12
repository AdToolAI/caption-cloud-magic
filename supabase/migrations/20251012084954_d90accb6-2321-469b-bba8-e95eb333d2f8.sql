-- Create app_role enum for user roles
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('owner', 'admin', 'editor', 'viewer');
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- Create user_roles table (IMPORTANT: Roles must be in separate table for security)
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'viewer',
  granted_by UUID REFERENCES auth.users(id),
  granted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, workspace_id)
);

-- Create white_label_settings table
CREATE TABLE IF NOT EXISTS public.white_label_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  logo_url TEXT,
  brand_name TEXT,
  primary_color TEXT DEFAULT '#6366f1',
  secondary_color TEXT DEFAULT '#8b5cf6',
  accent_color TEXT DEFAULT '#ec4899',
  custom_domain TEXT,
  favicon_url TEXT,
  login_background_url TEXT,
  show_powered_by BOOLEAN NOT NULL DEFAULT true,
  custom_css TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create role_permissions table to define what each role can do
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  role public.app_role NOT NULL,
  permission TEXT NOT NULL,
  resource TEXT NOT NULL,
  can_create BOOLEAN NOT NULL DEFAULT false,
  can_read BOOLEAN NOT NULL DEFAULT false,
  can_update BOOLEAN NOT NULL DEFAULT false,
  can_delete BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(role, permission, resource)
);

-- Insert default role permissions
INSERT INTO public.role_permissions (role, permission, resource, can_create, can_read, can_update, can_delete) VALUES
  ('owner', 'workspace', 'all', true, true, true, true),
  ('admin', 'workspace', 'all', true, true, true, false),
  ('admin', 'members', 'all', true, true, true, true),
  ('editor', 'content', 'all', true, true, true, false),
  ('editor', 'members', 'all', false, true, false, false),
  ('viewer', 'content', 'all', false, true, false, false)
ON CONFLICT (role, permission, resource) DO NOTHING;

-- Enable RLS
DO $$ BEGIN
  ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.white_label_settings ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Create security definer function to check user roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _workspace_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND workspace_id = _workspace_id
      AND role = _role
  )
$$;

-- Create function to check if user has any role in workspace
CREATE OR REPLACE FUNCTION public.is_workspace_member(_user_id UUID, _workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND workspace_id = _workspace_id
  )
$$;

-- Create function to get user's highest role in workspace
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID, _workspace_id UUID)
RETURNS public.app_role
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.user_roles
  WHERE user_id = _user_id
    AND workspace_id = _workspace_id
  ORDER BY 
    CASE role
      WHEN 'owner' THEN 1
      WHEN 'admin' THEN 2
      WHEN 'editor' THEN 3
      WHEN 'viewer' THEN 4
    END
  LIMIT 1
$$;

-- RLS Policies for user_roles
DO $$ BEGIN
  CREATE POLICY "Workspace members can view roles"
    ON public.user_roles FOR SELECT
    USING (public.is_workspace_member(auth.uid(), workspace_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can create roles"
    ON public.user_roles FOR INSERT
    WITH CHECK (
      public.has_role(auth.uid(), workspace_id, 'admin') OR 
      public.has_role(auth.uid(), workspace_id, 'owner')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can update roles"
    ON public.user_roles FOR UPDATE
    USING (
      public.has_role(auth.uid(), workspace_id, 'admin') OR 
      public.has_role(auth.uid(), workspace_id, 'owner')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can delete roles"
    ON public.user_roles FOR DELETE
    USING (
      public.has_role(auth.uid(), workspace_id, 'admin') OR 
      public.has_role(auth.uid(), workspace_id, 'owner')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RLS Policies for white_label_settings
DO $$ BEGIN
  CREATE POLICY "Workspace members can view white label settings"
    ON public.white_label_settings FOR SELECT
    USING (
      public.is_workspace_member(auth.uid(), workspace_id) OR
      auth.uid() = user_id
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Owners can create white label settings"
    ON public.white_label_settings FOR INSERT
    WITH CHECK (
      auth.uid() = user_id OR
      public.has_role(auth.uid(), workspace_id, 'owner')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Owners can update white label settings"
    ON public.white_label_settings FOR UPDATE
    USING (
      auth.uid() = user_id OR
      public.has_role(auth.uid(), workspace_id, 'owner')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Owners can delete white label settings"
    ON public.white_label_settings FOR DELETE
    USING (
      auth.uid() = user_id OR
      public.has_role(auth.uid(), workspace_id, 'owner')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RLS Policies for role_permissions (read-only for all authenticated users)
DO $$ BEGIN
  CREATE POLICY "Anyone can view role permissions"
    ON public.role_permissions FOR SELECT
    USING (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create trigger for white_label_settings updated_at
DO $$ BEGIN
  CREATE TRIGGER update_white_label_settings_updated_at
    BEFORE UPDATE ON public.white_label_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;