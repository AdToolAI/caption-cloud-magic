ALTER TABLE public.composer_scenes
  ADD COLUMN IF NOT EXISTS continuity_drift_score numeric NULL,
  ADD COLUMN IF NOT EXISTS continuity_drift_label text NULL,
  ADD COLUMN IF NOT EXISTS continuity_checked_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS continuity_auto_repair boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_composer_scenes_drift
  ON public.composer_scenes (project_id, continuity_drift_score)
  WHERE continuity_drift_score IS NOT NULL;

COMMENT ON COLUMN public.composer_scenes.continuity_drift_score IS '0 = perfect continuity to previous scene, 100 = total drift';
COMMENT ON COLUMN public.composer_scenes.continuity_drift_label IS 'AI-generated diff summary (e.g. "lighting changed, character missing")';