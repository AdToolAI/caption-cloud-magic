ALTER TABLE public.v434_artifact_pins
  ADD COLUMN IF NOT EXISTS attempt integer,
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'production',
  ADD COLUMN IF NOT EXISTS cell text,
  ADD COLUMN IF NOT EXISTS notes jsonb;

CREATE INDEX IF NOT EXISTS v434_artifact_pins_scene_run_idx
  ON public.v434_artifact_pins (scene_id, run_id, generation, pass_idx, kind);