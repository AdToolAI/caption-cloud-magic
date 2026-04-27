-- Hebel 4: Continuity Guardian Pro-Layer

-- 1. Extend composer_scenes with lock + drift tracking columns
ALTER TABLE public.composer_scenes
  ADD COLUMN IF NOT EXISTS continuity_locked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lock_reference_url TEXT,
  ADD COLUMN IF NOT EXISTS last_drift_check_at TIMESTAMPTZ;

-- 2. Drift-check history table
CREATE TABLE IF NOT EXISTS public.composer_drift_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.composer_projects(id) ON DELETE CASCADE,
  anchor_scene_id UUID REFERENCES public.composer_scenes(id) ON DELETE SET NULL,
  candidate_scene_id UUID REFERENCES public.composer_scenes(id) ON DELETE SET NULL,
  anchor_image_url TEXT,
  candidate_image_url TEXT,
  drift_score NUMERIC,
  label TEXT,
  recommendation TEXT,
  repaired BOOLEAN NOT NULL DEFAULT false,
  repair_action TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_composer_drift_checks_project
  ON public.composer_drift_checks(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_composer_drift_checks_candidate
  ON public.composer_drift_checks(candidate_scene_id);

ALTER TABLE public.composer_drift_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can view drift checks" ON public.composer_drift_checks;
CREATE POLICY "Owners can view drift checks"
  ON public.composer_drift_checks
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.composer_projects p
      WHERE p.id = composer_drift_checks.project_id
        AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owners can insert drift checks" ON public.composer_drift_checks;
CREATE POLICY "Owners can insert drift checks"
  ON public.composer_drift_checks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.composer_projects p
      WHERE p.id = composer_drift_checks.project_id
        AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owners can delete drift checks" ON public.composer_drift_checks;
CREATE POLICY "Owners can delete drift checks"
  ON public.composer_drift_checks
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.composer_projects p
      WHERE p.id = composer_drift_checks.project_id
        AND p.user_id = auth.uid()
    )
  );