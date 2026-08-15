-- v431 G3.1b — Ledger-Härtung: INSERT-Pflicht, Immutabilität, atomarer Replace, Reaper

ALTER TABLE public.composer_pipeline_jobs
  ADD COLUMN IF NOT EXISTS replaced_by uuid REFERENCES public.composer_pipeline_jobs(id) ON DELETE SET NULL;

-- Stichtag: ab hier gilt die INSERT-Pflicht. Pre-Stichtag-Zeilen dürfen ihre
-- plate_generation einmalig nachgetragen bekommen (in-flight Drain).
CREATE OR REPLACE FUNCTION public.composer_pipeline_jobs_g31_deployment_ts()
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$ SELECT TIMESTAMPTZ '2026-08-15 00:30:00+00' $$;

-- BEFORE INSERT: plate_generation ist Pflicht. Kein created_at-Bypass —
-- die Regel gilt für jeden neuen INSERT, unabhängig vom Caller-Payload.
CREATE OR REPLACE FUNCTION public.composer_pipeline_job_insert_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.plate_generation IS NULL THEN
    RAISE EXCEPTION 'composer_pipeline_jobs.plate_generation is mandatory on insert (scene %, stage %)',
      NEW.scene_id, NEW.stage
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS composer_pipeline_jobs_insert_guard ON public.composer_pipeline_jobs;
CREATE TRIGGER composer_pipeline_jobs_insert_guard
  BEFORE INSERT ON public.composer_pipeline_jobs
  FOR EACH ROW EXECUTE FUNCTION public.composer_pipeline_job_insert_guard();

-- BEFORE UPDATE: Identität + created_at immutable; plate_generation-Backfill
-- ausschließlich für Pre-Stichtag-Zeilen (gemessen an OLD.created_at).
CREATE OR REPLACE FUNCTION public.composer_pipeline_job_identity_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
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

  -- created_at darf nicht nachträglich verschoben werden: sonst könnte sich ein
  -- Post-Stichtag-Job das Backfill-Fenster erschleichen.
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'composer_pipeline_jobs.created_at is immutable (job %)', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.plate_generation IS DISTINCT FROM OLD.plate_generation THEN
    IF OLD.plate_generation IS NOT NULL THEN
      RAISE EXCEPTION 'composer_pipeline_jobs.plate_generation is immutable (job %)', OLD.id
        USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.created_at >= public.composer_pipeline_jobs_g31_deployment_ts() THEN
      RAISE EXCEPTION 'composer_pipeline_jobs.plate_generation backfill is only allowed for pre-G3.1 rows (job %)', OLD.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF OLD.external_job_id IS NOT NULL
     AND NEW.external_job_id IS DISTINCT FROM OLD.external_job_id THEN
    RAISE EXCEPTION 'composer_pipeline_jobs.external_job_id is immutable (job %)', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- Atomarer Replace-Attempt: alten Attempt terminalisieren + neuen anlegen in
-- EINER Transaktion. Parallelversuche verlieren deterministisch.
CREATE OR REPLACE FUNCTION public.composer_replace_pipeline_attempt(
  p_previous_job_id uuid,
  p_expected_scene_id uuid,
  p_expected_run_id uuid,
  p_expected_stage text,
  p_expected_plate_generation integer,
  p_provider text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (job_id uuid, attempt_no integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_prev public.composer_pipeline_jobs%ROWTYPE;
  v_new_attempt integer;
  v_new_id uuid;
  v_key text;
BEGIN
  SELECT * INTO v_prev
  FROM public.composer_pipeline_jobs
  WHERE id = p_previous_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'replace_attempt: previous job % not found', p_previous_job_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_prev.scene_id IS DISTINCT FROM p_expected_scene_id
     OR v_prev.run_id IS DISTINCT FROM p_expected_run_id
     OR v_prev.stage IS DISTINCT FROM p_expected_stage
     OR v_prev.plate_generation IS DISTINCT FROM p_expected_plate_generation THEN
    RAISE EXCEPTION 'replace_attempt: identity mismatch for job %', p_previous_job_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_prev.replaced_by IS NOT NULL
     OR v_prev.status IN ('stale', 'succeeded', 'cancelled') THEN
    RAISE EXCEPTION 'replace_attempt: job % is not replaceable (status %, replaced_by %)',
      p_previous_job_id, v_prev.status, v_prev.replaced_by
      USING ERRCODE = 'check_violation';
  END IF;

  v_new_attempt := v_prev.attempt_no + 1;
  v_key := concat_ws(':',
    v_prev.scene_id::text,
    v_prev.run_id::text,
    v_prev.stage,
    COALESCE(v_prev.segment_id::text, '-'),
    v_new_attempt::text
  );

  INSERT INTO public.composer_pipeline_jobs (
    scene_id, run_id, run_contract_version, stage, segment_id, speaker_id,
    attempt_no, plate_generation, provider, idempotency_key, status,
    started_at, metadata
  ) VALUES (
    v_prev.scene_id, v_prev.run_id, v_prev.run_contract_version, v_prev.stage,
    v_prev.segment_id, v_prev.speaker_id,
    v_new_attempt, v_prev.plate_generation, COALESCE(p_provider, v_prev.provider),
    v_key, 'dispatching', now(),
    COALESCE(p_metadata, '{}'::jsonb)
      || jsonb_build_object('ledger_source', 'v431_g31b_replace', 'replaces_job_id', v_prev.id::text)
  )
  RETURNING id INTO v_new_id;

  UPDATE public.composer_pipeline_jobs
  SET status = 'stale',
      replaced_by = v_new_id,
      completed_at = now(),
      error_code = COALESCE(error_code, 'replaced_by_retry')
  WHERE id = v_prev.id;

  RETURN QUERY SELECT v_new_id, v_new_attempt;
END;
$$;

REVOKE ALL ON FUNCTION public.composer_replace_pipeline_attempt(uuid, uuid, uuid, text, integer, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.composer_replace_pipeline_attempt(uuid, uuid, uuid, text, integer, text, jsonb) TO service_role;

-- Reaper: verwaiste dispatching-Zeilen ohne external_job_id werden NIE terminal
-- gemacht. Ungewissheit bleibt recoverable (dispatch_uncertain).
CREATE OR REPLACE FUNCTION public.composer_reap_orphaned_dispatches(p_older_than_minutes integer DEFAULT 10)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.composer_pipeline_jobs
  SET status = 'dispatch_uncertain',
      error_code = COALESCE(error_code, 'reaper_orphaned_dispatch')
  WHERE status IN ('pending', 'dispatching')
    AND external_job_id IS NULL
    AND started_at IS NOT NULL
    AND started_at < now() - make_interval(mins => GREATEST(p_older_than_minutes, 1));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.composer_reap_orphaned_dispatches(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.composer_reap_orphaned_dispatches(integer) TO service_role;