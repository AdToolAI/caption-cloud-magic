CREATE OR REPLACE FUNCTION public.composer_acquire_pipeline_attempt(p_scene_id uuid, p_run_id uuid, p_stage text, p_plate_generation integer, p_run_contract_version integer DEFAULT NULL::integer, p_segment_id uuid DEFAULT NULL::uuid, p_speaker_id uuid DEFAULT NULL::uuid, p_provider text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(job_id uuid, attempt_no integer, outcome text, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_active public.composer_pipeline_jobs%ROWTYPE;
  v_attempt integer;
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

  SELECT j.* INTO v_active
  FROM public.composer_pipeline_jobs j
  WHERE j.scene_id = p_scene_id
    AND j.run_id = p_run_id
    AND j.stage = p_stage
    AND j.plate_generation = p_plate_generation
    AND j.segment_id IS NOT DISTINCT FROM p_segment_id
    AND j.replaced_by IS NULL
    AND j.status IN ('pending', 'dispatching', 'dispatched', 'dispatch_uncertain')
  ORDER BY j.attempt_no DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT v_active.id, v_active.attempt_no, 'already_in_flight'::text, v_active.status;
    RETURN;
  END IF;

  SELECT COALESCE(MAX(j.attempt_no), 0) + 1 INTO v_attempt
  FROM public.composer_pipeline_jobs j
  WHERE j.scene_id = p_scene_id
    AND j.run_id = p_run_id
    AND j.stage = p_stage
    AND j.segment_id IS NOT DISTINCT FROM p_segment_id;

  v_key := concat_ws(':',
    p_scene_id::text, p_run_id::text, p_stage,
    COALESCE(p_segment_id::text, '-'), v_attempt::text);

  BEGIN
    INSERT INTO public.composer_pipeline_jobs (
      scene_id, run_id, run_contract_version, stage, segment_id, speaker_id,
      attempt_no, plate_generation, provider, idempotency_key, status,
      started_at, metadata
    ) VALUES (
      p_scene_id, p_run_id, COALESCE(p_run_contract_version, 427), p_stage,
      p_segment_id, p_speaker_id,
      v_attempt, p_plate_generation, p_provider, v_key, 'dispatching', now(),
      COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('ledger_source', 'v431_g31b_acquire')
    )
    ON CONFLICT ON CONSTRAINT composer_pipeline_jobs_identity_unique DO NOTHING
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    v_id := NULL;
  END;

  IF v_id IS NOT NULL THEN
    RETURN QUERY SELECT v_id, v_attempt, 'acquired'::text, 'dispatching'::text;
    RETURN;
  END IF;

  SELECT j.* INTO v_active
  FROM public.composer_pipeline_jobs j
  WHERE j.scene_id = p_scene_id
    AND j.run_id = p_run_id
    AND j.stage = p_stage
    AND j.segment_id IS NOT DISTINCT FROM p_segment_id
    AND j.attempt_no = v_attempt
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'acquire_attempt: lost race but winner row not found (scene %, stage %, attempt %)',
      p_scene_id, p_stage, v_attempt
      USING ERRCODE = 'no_data_found';
  END IF;

  RETURN QUERY SELECT v_active.id, v_active.attempt_no, 'already_in_flight'::text, v_active.status;
END;
$function$;