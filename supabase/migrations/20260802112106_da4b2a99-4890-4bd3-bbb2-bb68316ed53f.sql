ALTER TABLE public.composer_scenes
  ADD COLUMN IF NOT EXISTS plate_generation integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS plate_generation_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS plate_ready_generation integer,
  ADD COLUMN IF NOT EXISTS plate_ready_at timestamptz;

UPDATE public.composer_scenes
SET plate_ready_generation = 1
WHERE plate_ready_generation IS NULL
  AND clip_url IS NOT NULL
  AND length(clip_url) > 0;

CREATE INDEX IF NOT EXISTS composer_scenes_plate_generation_idx
  ON public.composer_scenes (id, plate_generation);