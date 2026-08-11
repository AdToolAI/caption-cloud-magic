GRANT SELECT ON public.system_config TO authenticated;

CREATE POLICY "Authenticated can read composer feature flags"
ON public.system_config
FOR SELECT
TO authenticated
USING (key LIKE 'composer.feature.%');