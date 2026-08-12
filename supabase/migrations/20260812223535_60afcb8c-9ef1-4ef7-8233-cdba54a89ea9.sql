INSERT INTO public.system_config (key, value, description)
VALUES
  ('v427.pipeline_jobs_dual_write',
   '{"enabled": false, "user_ids": ["ab6bf0d1-fe33-4cdd-b2cc-4a4ce727b4f4"]}'::jsonb,
   'v427 A2: mirror composer dispatches into composer_pipeline_jobs (telemetry only).'),
  ('v427.callback_guard_mode',
   '{"mode": "observe", "fallback_mode": "off", "user_ids": ["ab6bf0d1-fe33-4cdd-b2cc-4a4ce727b4f4"]}'::jsonb,
   'v427 A3: off | observe | enforce. Scoped rollout; other accounts fall back to off.')
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      description = EXCLUDED.description,
      updated_at = now();

UPDATE public.system_config
   SET value = '{"enabled": false, "user_ids": []}'::jsonb,
       description = 'v425: Seedance 2.5 is NOT a certified lip-sync provider. Keep disabled.',
       updated_at = now()
 WHERE key = 'composer.feature.seedance25_lipsync';