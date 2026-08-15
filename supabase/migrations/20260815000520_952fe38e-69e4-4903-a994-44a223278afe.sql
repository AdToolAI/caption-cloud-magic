-- v431 G3.1 — Ledger wird alleinige SoT für Run/Generation-Provenienz.
-- Additiv: neue Spalte + Immutabilitäts-Trigger. Kein Writer wird migriert.

ALTER TABLE public.composer_pipeline_jobs
  ADD COLUMN IF NOT EXISTS plate_generation integer;

COMMENT ON COLUMN public.composer_pipeline_jobs.plate_generation IS
  'v431 G3.1 — beim Job-Insert aus dem Szenen-Snapshot eingefrorene composer_scenes.plate_generation. Immutable.';

CREATE INDEX IF NOT EXISTS idx_composer_pipeline_jobs_scene_run_gen
  ON public.composer_pipeline_jobs (scene_id, run_id, plate_generation);

-- Immutabilität der Identitätsfelder (D2).
CREATE OR REPLACE FUNCTION public.composer_pipeline_job_identity_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF NEW.scene_id IS DISTINCT FROM OLD.scene_id THEN
    RAISE EXCEPTION 'composer_pipeline_jobs.scene_id is immutable (job %)', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.run_id IS DISTINCT FROM OLD.run_id THEN
    RAISE EXCEPTION 'composer_pipeline_jobs.run_id is immutable (job %)', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.stage IS DISTINCT FROM OLD.stage THEN
    RAISE EXCEPTION 'composer_pipeline_jobs.stage is immutable (job %)', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.attempt_no IS DISTINCT FROM OLD.attempt_no THEN
    RAISE EXCEPTION 'composer_pipeline_jobs.attempt_no is immutable (job %)', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.segment_id IS DISTINCT FROM OLD.segment_id THEN
    RAISE EXCEPTION 'composer_pipeline_jobs.segment_id is immutable (job %)', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  -- plate_generation: NULL -> Wert ist erlaubt (Backfill in-flight Jobs),
  -- Wert -> anderer Wert niemals.
  IF OLD.plate_generation IS NOT NULL
     AND NEW.plate_generation IS DISTINCT FROM OLD.plate_generation THEN
    RAISE EXCEPTION 'composer_pipeline_jobs.plate_generation is immutable (job %)', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  -- external_job_id: einmal gesetzt, nie überschrieben.
  IF OLD.external_job_id IS NOT NULL
     AND NEW.external_job_id IS DISTINCT FROM OLD.external_job_id THEN
    RAISE EXCEPTION 'composer_pipeline_jobs.external_job_id is immutable (job %)', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS composer_pipeline_jobs_identity_guard ON public.composer_pipeline_jobs;
CREATE TRIGGER composer_pipeline_jobs_identity_guard
  BEFORE UPDATE ON public.composer_pipeline_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.composer_pipeline_job_identity_guard();

REVOKE ALL ON FUNCTION public.composer_pipeline_job_identity_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.composer_pipeline_job_identity_guard() FROM anon;
REVOKE ALL ON FUNCTION public.composer_pipeline_job_identity_guard() FROM authenticated;

NOTIFY pgrst, 'reload schema';