GRANT SELECT ON public.system_config TO authenticated;
GRANT ALL ON public.system_config TO service_role;

UPDATE public.system_config
SET value = jsonb_set(value, '{enabled}', 'true'::jsonb)
WHERE key = 'composer.feature.seedance25_lipsync';