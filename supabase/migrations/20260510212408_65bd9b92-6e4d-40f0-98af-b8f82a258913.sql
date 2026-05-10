ALTER TABLE public.composer_scenes
  ADD COLUMN IF NOT EXISTS twoshot_stage text,
  ADD COLUMN IF NOT EXISTS continuity_drift_score numeric,
  ADD COLUMN IF NOT EXISTS continuity_drift_notes jsonb;