-- Create user_roles table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE (user_id, role)
);

-- Enable RLS if not already enabled
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
DROP POLICY IF EXISTS "Everyone can view public templates" ON public.video_templates;
DROP POLICY IF EXISTS "Admins can insert templates" ON public.video_templates;
DROP POLICY IF EXISTS "Admins can update templates" ON public.video_templates;
DROP POLICY IF EXISTS "Admins can delete templates" ON public.video_templates;
DROP POLICY IF EXISTS "Everyone can view field mappings" ON public.template_field_mappings;
DROP POLICY IF EXISTS "Admins can insert field mappings" ON public.template_field_mappings;
DROP POLICY IF EXISTS "Admins can update field mappings" ON public.template_field_mappings;
DROP POLICY IF EXISTS "Admins can delete field mappings" ON public.template_field_mappings;

-- Create security definer function to check roles (if not exists, replace if exists)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create function to get user roles
CREATE OR REPLACE FUNCTION public.get_user_roles(_user_id UUID)
RETURNS SETOF app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.user_roles
  WHERE user_id = _user_id
$$;

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for video_templates (only admins can manage)
CREATE POLICY "Everyone can view public templates"
ON public.video_templates
FOR SELECT
TO authenticated
USING (is_public = true OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert templates"
ON public.video_templates
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update templates"
ON public.video_templates
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete templates"
ON public.video_templates
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for template_field_mappings (only admins can manage)
CREATE POLICY "Everyone can view field mappings"
ON public.template_field_mappings
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can insert field mappings"
ON public.template_field_mappings
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update field mappings"
ON public.template_field_mappings
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete field mappings"
ON public.template_field_mappings
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));