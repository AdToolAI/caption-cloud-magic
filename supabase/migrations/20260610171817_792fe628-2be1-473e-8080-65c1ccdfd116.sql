INSERT INTO public.system_config (key, value, description) VALUES
  ('composer.parallel_tts_anchor', 'false'::jsonb, 'Plan B Hebel A — parallelize TTS and anchor-image generation in compose-video-clips. Default OFF; enable per-scene after validation.'),
  ('composer.batch_preclip_render', 'false'::jsonb, 'Plan B Hebel B — render all v69 single-face preclips in parallel up-front in compose-dialog-segments instead of one per pass. Default OFF; enable after one validated 4-speaker render.')
ON CONFLICT (key) DO NOTHING;