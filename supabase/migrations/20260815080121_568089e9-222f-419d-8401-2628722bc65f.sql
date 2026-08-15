CREATE OR REPLACE FUNCTION public.composer_acquire_pipeline_attempt(p_scene_id uuid, p_run_id uuid, p_stage text, p_plate_generation integer, p_run_contract_version integer DEFAULT NULL::integer, p_segment_id uuid DEFAULT NULL::uuid, p_speaker_id uuid DEFAULT NULL::uuid, p_provider text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(job_id uuid, attempt_no integer, outcome text, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
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

  -- G3.1b-Endvertrag: Initial-Akquise ist AUSSCHLIESSLICH Attempt 1. Existiert
  -- fuer diese (scene, run, stage, segment) irgendein Attempt -- egal in welchem
  -- Status -- ist das kein Initial-Dispatch mehr. Ein semantischer Retry bleibt
  -- Retry und laeuft nur ueber composer_replace_pipeline_attempt.
  SELECT j.* INTO v_existing
  FROM public.composer_pipeline_jobs j
  WHERE j.scene_id = p_scene_id
    AND j.run_id = p_run_id
    AND j.stage = p_stage
    AND j.segment_id IS NOT DISTINCT FROM p_segment_id
  ORDER BY j.attempt_no DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT v_existing.id, v_existing.attempt_no, 'already_in_flight'::text, v_existing.status;
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
  IS 'v431 G3.1b: Initial-Akquise, ausschliesslich Attempt 1. Erzeugt niemals Attempt > 1; jeder Retry laeuft ueber composer_replace_pipeline_attempt.';

COMMENT ON FUNCTION public.composer_reap_orphaned_dispatches(integer)
  IS 'v431 G3.1b: verschiebt verwaiste Dispatches auf RECOVERABLE dispatch_uncertain (kein completed_at, keine terminale Semantik). Ein spaeter eintreffender legitimer Callback findet den Job weiterhin.';