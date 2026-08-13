UPDATE public.system_config
SET value = jsonb_build_object('enabled', true, 'user_ids', jsonb_build_array('ab6bf0d1-fe33-4cdd-b2cc-4a4ce727b4f4')),
    updated_at = now()
WHERE key = 'v427.pipeline_jobs_dual_write';

UPDATE public.system_config
SET value = jsonb_build_object('mode', 'observe', 'fallback_mode', 'off', 'user_ids', jsonb_build_array('ab6bf0d1-fe33-4cdd-b2cc-4a4ce727b4f4')),
    updated_at = now()
WHERE key = 'v427.callback_guard_mode';