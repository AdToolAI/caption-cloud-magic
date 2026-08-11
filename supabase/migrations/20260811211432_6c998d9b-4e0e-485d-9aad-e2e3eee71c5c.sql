INSERT INTO public.system_config (key, value)
VALUES ('composer.feature.seedance25_lipsync', '{"enabled": false, "user_ids": ["ab6bf0d1-fe33-4cdd-b2cc-4a4ce727b4f4"]}'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;