
-- 1. calendar_approvals: drop public token-based SELECT policy.
DROP POLICY IF EXISTS "Public can view with valid token" ON public.calendar_approvals;

-- 2. template_views: replace fully-public policies with authenticated, owner-scoped ones.
DROP POLICY IF EXISTS "Anyone can record views" ON public.template_views;
DROP POLICY IF EXISTS "Anyone can view template views" ON public.template_views;

CREATE POLICY "Authenticated users can record their own views"
  ON public.template_views
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view their own template views"
  ON public.template_views
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Revoke anon access to template_views (authenticated-only now).
REVOKE ALL ON public.template_views FROM anon;
GRANT SELECT, INSERT ON public.template_views TO authenticated;
GRANT ALL ON public.template_views TO service_role;
