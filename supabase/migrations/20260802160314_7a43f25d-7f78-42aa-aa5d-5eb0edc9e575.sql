INSERT INTO public.composer_scene_transitions (from_state, to_state) VALUES
  ('lipsync_running','complete'),
  ('lipsync_dispatched','complete'),
  ('audio_ready','complete')
ON CONFLICT DO NOTHING;