UPDATE public.system_config
SET value = 'true'::jsonb, updated_at = now()
WHERE key = 'composer.batch_preclip_render';

INSERT INTO public.system_config (key, value, description)
SELECT 'composer.batch_preclip_render', 'true'::jsonb,
       'Plan B Hebel B — parallel preclip prefetch for all N passes on first dispatch (Juni 2026)'
WHERE NOT EXISTS (SELECT 1 FROM public.system_config WHERE key = 'composer.batch_preclip_render');