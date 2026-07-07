INSERT INTO public.system_config (key, value)
VALUES ('composer.sync_so_concurrency_cap', '4'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();