INSERT INTO public.system_config (key, value, updated_at)
VALUES
  ('composer.silent_speaker_pass_v194', 'true'::jsonb, now()),
  ('composer.silent_speaker_pass_charge_user', 'false'::jsonb, now()),
  ('composer.silent_speaker_pass_require_bbox', 'true'::jsonb, now()),
  ('composer.listener_mouth_matte_v193', 'false'::jsonb, now()),
  ('composer.silent_faces_v183', 'false'::jsonb, now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();