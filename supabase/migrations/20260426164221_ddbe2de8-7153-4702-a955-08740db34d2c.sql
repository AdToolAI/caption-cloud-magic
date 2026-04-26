ALTER TABLE public.composer_scenes
  ADD COLUMN IF NOT EXISTS trim_start_sec NUMERIC,
  ADD COLUMN IF NOT EXISTS trim_end_sec NUMERIC;

COMMENT ON COLUMN public.composer_scenes.trim_start_sec IS 'In-point inside the source clip (seconds). Set by NLE roundtrip import.';
COMMENT ON COLUMN public.composer_scenes.trim_end_sec IS 'Out-point inside the source clip (seconds). Set by NLE roundtrip import.';