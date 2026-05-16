-- 1. Wallets: remove client-facing UPDATE policy entirely. Balance mutations
--    must go through service_role edge functions (credit-spend, billing, etc.).
DROP POLICY IF EXISTS "Users can update their own wallet" ON public.wallets;

-- 2. video_template_versions: restrict INSERT to admins, and require created_by
--    to match the caller. Templates are admin-managed (see video_templates
--    policies), so versions must be too.
DROP POLICY IF EXISTS "Users can create template versions" ON public.video_template_versions;

CREATE POLICY "Admins can create template versions"
ON public.video_template_versions
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  AND created_by = auth.uid()
);

-- Also tighten UPDATE/DELETE so non-admin "owners" (which shouldn't exist anymore)
-- can't mutate existing rows. Keep admin override.
DROP POLICY IF EXISTS "Users can update their own template versions" ON public.video_template_versions;
DROP POLICY IF EXISTS "Users can delete their own template versions" ON public.video_template_versions;

CREATE POLICY "Admins can update template versions"
ON public.video_template_versions
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete template versions"
ON public.video_template_versions
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));