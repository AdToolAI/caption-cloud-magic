-- v431 G3.1b Restschluss — Acquire-Predecessor-Guard + DB-seitige Retry-Allowlist

-- 1) Geschlossene Allowlist als SQL-Konstante (Spiegel der TS-Liste in _shared/v431-ledger.ts)
CREATE OR REPLACE FUNCTION public.composer_retryable_failure_reasons()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT ARRAY[
    'provider_transient_error',
    'provider_timeout',
    'provider_rate_limited',
    'dispatch_uncertain_recovery',
    'watchdog_stalled',
    'poller_timeout',
    'mux_redispatch'
  ]::text[];
$$;

COMMENT ON FUNCTION public.composer_retryable_failure_reasons()
  IS 'v431 G3.1b: geschlossene Menge retryfaehiger Failure-Codes. Autorisierung erfolgt DB-seitig gegen den GESPEICHERTEN error_code des Vorgaengers; ein Caller-retry_reason dokumentiert nur.';

-- 2) Initial-Akquise: aktiver Vorgaenger -> already_in_flight, terminaler Vorgaenger -> predecessor_exists
CREATE OR REPLACE FUNCTION public.composer_acquire_pipeline_attempt(p_scene_id uuid, p_run_id uuid, p_stage text, p_plate_generation integer, p_run_contract_version integer DEFAULT NULL::integer, p_segment_id uuid DEFAULT NULL::uuid, p_speaker_id uuid DEFAULT NULL::uuid, p_provider text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS TABLE(job_id uuid, attempt_no integer, outcome text, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_existing public.composer_pipeline_jobs%ROWTYPE;
  v_key text;
  v_id uuid;
BEGIN
  IF p_scene_id IS NULL OR p_run_id IS NULL OR p_stage IS NULL THEN
    RAISE EXCEPTION 'acquire_attempt: scene_id, run_id and stage are mandatory'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_plate_generation IS NULL THEN
    RAISE EXCEPTION 'acquire_attempt: plate_generation is mandatory (scene %, stage %)',
      p_scene_id, p_stage
      USING ERRCODE = 'check_violation';
  END IF;

  -- G3.1b-Endvertrag: Initial-Akquise gilt nur, wenn fuer diese Identitaet
  -- (scene, run, stage, segment) UEBERHAUPT KEIN Attempt existiert.
  SELECT j.* INTO v_existing
  FROM public.composer_pipeline_jobs j
  WHERE j.scene_id = p_scene_id
    AND j.run_id = p_run_id
    AND j.stage = p_stage
    AND j.segment_id IS NOT DISTINCT FROM p_segment_id
  ORDER BY j.attempt_no DESC
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.replaced_by IS NULL
       AND v_existing.status IN ('pending', 'dispatching', 'dispatched', 'dispatch_uncertain') THEN
      RETURN QUERY SELECT v_existing.id, v_existing.attempt_no, 'already_in_flight'::text, v_existing.status;
    ELSE
      -- Terminaler Vorgaenger: NIE still Attempt N+1. Retry nur ueber den
      -- expliziten Replace-Vertrag.
      RETURN QUERY SELECT v_existing.id, v_existing.attempt_no, 'predecessor_exists'::text, v_existing.status;
    END IF;
    RETURN;
  END IF;

  v_key := concat_ws(':',
    p_scene_id::text, p_run_id::text, p_stage,
    COALESCE(p_segment_id::text, '-'), '1');

  BEGIN
    INSERT INTO public.composer_pipeline_jobs (
      scene_id, run_id, run_contract_version, stage, segment_id, speaker_id,
      attempt_no, plate_generation, provider, idempotency_key, status,
      started_at, metadata
    ) VALUES (
      p_scene_id, p_run_id, COALESCE(p_run_contract_version, 427), p_stage,
      p_segment_id, p_speaker_id,
      1, p_plate_generation, p_provider, v_key, 'dispatching', now(),
      COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('ledger_source', 'v431_g31b_acquire')
    )
    ON CONFLICT ON CONSTRAINT composer_pipeline_jobs_identity_unique DO NOTHING
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    v_id := NULL;
  END;

  IF v_id IS NOT NULL THEN
    RETURN QUERY SELECT v_id, 1, 'acquired'::text, 'dispatching'::text;
    RETURN;
  END IF;

  SELECT j.* INTO v_existing
  FROM public.composer_pipeline_jobs j
  WHERE j.scene_id = p_scene_id
    AND j.run_id = p_run_id
    AND j.stage = p_stage
    AND j.segment_id IS NOT DISTINCT FROM p_segment_id
    AND j.attempt_no = 1
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'acquire_attempt: lost race but winner row not found (scene %, stage %)',
      p_scene_id, p_stage
      USING ERRCODE = 'no_data_found';
  END IF;

  RETURN QUERY SELECT v_existing.id, v_existing.attempt_no, 'already_in_flight'::text, v_existing.status;
END;
$function$;

COMMENT ON FUNCTION public.composer_acquire_pipeline_attempt(uuid, uuid, text, integer, integer, uuid, uuid, text, jsonb)
  IS 'v431 G3.1b: Initial-Akquise ausschliesslich Attempt 1. Aktiver Vorgaenger -> already_in_flight, terminaler Vorgaenger -> predecessor_exists (kein INSERT). Attempt > 1 entsteht nur ueber composer_replace_pipeline_attempt.';

-- 3) Replace: Autorisierung des Retrys DB-seitig unter Row-Lock
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
AS $function$
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

  -- G3.1b-Endvertrag: Ein bereits FAILED gelaufener Vorgaenger darf nur dann
  -- ersetzt werden, wenn sein GESPEICHERTER error_code in der geschlossenen
  -- Allowlist steht. Ein vom Caller geliefertes retry_reason dokumentiert nur
  -- und autorisiert nichts.
  IF v_prev.status = 'failed'
     AND NOT (COALESCE(v_prev.error_code, '') = ANY (public.composer_retryable_failure_reasons())) THEN
    RAISE EXCEPTION 'replace_attempt: failure_not_retryable (job %, stored error_code %)',
      p_previous_job_id, COALESCE(v_prev.error_code, '<null>')
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
$function$;

COMMENT ON FUNCTION public.composer_replace_pipeline_attempt(uuid, uuid, uuid, text, integer, text, jsonb)
  IS 'v431 G3.1b: atomarer Retry-Vertrag. Row-Lock auf den Vorgaenger, Identitaetspruefung, DB-seitige Allowlist-Pruefung des GESPEICHERTEN error_code bei failed, dann stale + Attempt N+1.';

REVOKE ALL ON FUNCTION public.composer_retryable_failure_reasons() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.composer_retryable_failure_reasons() TO service_role;

DO $$
DECLARE r text;
BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'sandbox_exec%' LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.composer_retryable_failure_reasons() TO %I', r);
  END LOOP;
END $$;