-- Insert default settings if they don't exist
INSERT INTO public.settings (key, value_json)
VALUES 
  ('free_limit', '{"limit": 3}'::jsonb),
  ('caption_max_length', '{"length": 250}'::jsonb),
  ('hashtag_count', '{"count": 5}'::jsonb)
ON CONFLICT (key) DO NOTHING;