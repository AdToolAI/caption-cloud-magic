
-- 1. user_roles: workspace-scoped admin policies
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;

CREATE POLICY "Admins can insert roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), workspace_id, 'admin'::public.app_role)
    OR public.has_role(auth.uid(), workspace_id, 'owner'::public.app_role)
  );

CREATE POLICY "Admins can update roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), workspace_id, 'admin'::public.app_role)
    OR public.has_role(auth.uid(), workspace_id, 'owner'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), workspace_id, 'admin'::public.app_role)
    OR public.has_role(auth.uid(), workspace_id, 'owner'::public.app_role)
  );

CREATE POLICY "Admins can delete roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), workspace_id, 'admin'::public.app_role)
    OR public.has_role(auth.uid(), workspace_id, 'owner'::public.app_role)
  );

-- 2. bug-screenshots: owner-scoped read
DROP POLICY IF EXISTS "Anyone can view bug screenshots" ON storage.objects;

CREATE POLICY "Users can view own bug screenshots" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'bug-screenshots'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Admins can view all bug screenshots" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'bug-screenshots'
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );
