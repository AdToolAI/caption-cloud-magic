-- Add video render feature codes to feature_costs table
INSERT INTO feature_costs (feature_code, credits_per_use, description)
VALUES 
  ('video_render', 5, 'Video Render (Universal Creator)'),
  ('video_render_remotion', 5, 'Video Render via Remotion'),
  ('video_render_shotstack', 10, 'Video Render via Shotstack')
ON CONFLICT (feature_code) DO NOTHING;