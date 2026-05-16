DROP POLICY IF EXISTS "Anyone can view video templates" ON public.video_templates;
DROP POLICY IF EXISTS "Everyone can view public templates" ON public.video_templates;

CREATE POLICY "Public templates are viewable"
ON public.video_templates
FOR SELECT
TO anon, authenticated
USING (is_public = true OR (auth.uid() IS NOT NULL AND has_role(auth.uid(), 'admin'::app_role)));