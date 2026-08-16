-- v431 G3.2.2-F1.IMP — Atomic Stitch Finalizer + audio_mux Narrow Patch
-- Adds composer_finalize_lipsync_scene, the sole owner of scene terminalization
-- for the sync-segments audio mux stitch path.

CREATE OR REPLACE FUNCTION public.composer_finalize_lipsync_scene(
  _pipeline_job_id uuid,
  _external_job_id text,
  _scene_id uuid,
  _final_url text,
  _write_id text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _job public.composer_pipeline_jobs%ROWTYPE;
  _scene public.composer_scenes%ROWTYPE;
  _verdict text := NULL;
  _caller_role text;
  _marker jsonb;
  _job_rs3_reset_id text;
  _current_rs3_reset_id text;
  _audio_mux jsonb;
  _from_state public.composer_scene_state;
  _to_state public.composer_scene_state;
BEGIN
  _caller_role := coalesce(
    current_setting('request.jwt.claims', true)::jsonb ->> 'role',
    current_setting('request.jwt.claim.role', true),
    ''
  );

  -- F1.IMP: write_id is strictly allowlisted.
  IF _write_id IS DISTINCT FROM 'stitch:done' THEN
    RETURN jsonb_build_object(
      'verdict', 'invalid_write_id',
      'scene_id', _scene_id,
      'pipeline_job_id', _pipeline_job_id
    );
  END IF;

  -- Lock the ledger job first; it is the provenance carrier.
  SELECT * INTO _job FROM public.composer_pipeline_jobs WHERE id = _pipeline_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'verdict', 'no_ledger_job',
      'scene_id', _scene_id,
      'pipeline_job_id', _pipeline_job_id
    );
  END IF;

  -- Lock the authoritative scene from the ledger, not the request.
  SELECT * INTO _scene FROM public.composer_scenes WHERE id = _job.scene_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'verdict', 'no_ledger_job',
      'scene_id', _scene_id,
      'pipeline_job_id', _pipeline_job_id
    );
  END IF;

  -- _scene_id is only a confirmation guard.
  IF _scene.id IS DISTINCT FROM _scene_id THEN
    RETURN jsonb_build_object(
      'verdict', 'wrong_job',
      'scene_id', _scene.id,
      'pipeline_job_id', _pipeline_job_id
    );
  END IF;

  -- Stage must be audio_mux for this finalizer.
  IF _job.stage IS DISTINCT FROM 'audio_mux' THEN
    _verdict := 'wrong_stage';
  -- External job id must match exactly.
  ELSIF _job.external_job_id IS DISTINCT FROM _external_job_id THEN
    _verdict := 'wrong_job';
  -- Run and generation must match the scene.
  ELSIF _job.run_id IS DISTINCT FROM _scene.active_run_id THEN
    _verdict := 'stale_run';
  ELSIF _job.plate_generation IS DISTINCT FROM _scene.plate_generation THEN
    _verdict := 'stale_generation';
  -- Already succeeded.
  ELSIF _job.status = 'succeeded' THEN
    _verdict := 'already_completed';
  -- Terminal failure / cancellation / replacement.
  ELSIF _job.status IN ('failed', 'stale', 'cancelled') OR _job.replaced_by IS NOT NULL THEN
    _verdict := 'canceled';
  -- Scene-level explicit cancel.
  ELSIF _scene.lip_sync_status = 'canceled' THEN
    _verdict := 'canceled';
  -- Closed From-State matrix.
  ELSIF _job.status NOT IN ('dispatched', 'dispatch_uncertain') THEN
    _verdict := 'wrong_job';
  -- dispatch_uncertain only allowed when external_job_id proves real dispatch.
  ELSIF _job.status = 'dispatch_uncertain' AND _job.external_job_id IS DISTINCT FROM _external_job_id THEN
    _verdict := 'wrong_job';
  END IF;

  -- RS3 epoch-aware check: a marker alone does not cancel.
  IF _verdict IS NULL THEN
    _marker := COALESCE(_scene.audio_plan, '{}'::jsonb)->'twoshot'->'rs3_reset';
    IF jsonb_typeof(_marker) = 'object'
       AND (_marker->>'run_id') IS NOT DISTINCT FROM _scene.active_run_id::text
       AND COALESCE((_marker->>'plate_generation')::integer, -1) IS NOT DISTINCT FROM COALESCE(_scene.plate_generation, -1) THEN
      _current_rs3_reset_id := _marker->>'reset_id';
      _job_rs3_reset_id := _job.metadata->>'rs3_reset_id';
      IF _job_rs3_reset_id IS DISTINCT FROM _current_rs3_reset_id THEN
        _verdict := 'pre_reset_attempt';
      END IF;
    END IF;
  END IF;

  _from_state := _scene.pipeline_state;

  IF _verdict IS NOT NULL THEN
    INSERT INTO public.composer_scene_transition_log (
      scene_id, project_id, from_state, to_state, step_index, is_intermediate,
      guard_mode, run_id, generation, write_id, applied, reason,
      source_signature, caller_class, caller_role, auth_uid, detail
    ) VALUES (
      _scene.id, _scene.project_id, _from_state, _from_state, 1, false,
      'run_bound', _job.run_id, _job.plate_generation, _write_id, false, _verdict,
      'g322_stitch_finalize', 'stitch_finalize', _caller_role, auth.uid(),
      jsonb_build_object(
        'pipeline_job_id', _pipeline_job_id,
        'external_job_id', _external_job_id,
        'job_status', _job.status,
        'job_stage', _job.stage
      )
    );
    RETURN jsonb_build_object(
      'verdict', _verdict,
      'scene_id', _scene.id,
      'pipeline_job_id', _pipeline_job_id
    );
  END IF;

  -- Atomic terminalization: ledger job -> succeeded, scene -> complete.
  UPDATE public.composer_pipeline_jobs
  SET status = 'succeeded',
      completed_at = now(),
      callback_delivery_status = 'succeeded',
      updated_at = now()
  WHERE id = _job.id;

  _audio_mux := COALESCE(_scene.dialog_shots->'audio_mux', '{}'::jsonb);
  _audio_mux := jsonb_set(_audio_mux, ARRAY['finished_at'], to_jsonb(now()::text), true);
  _audio_mux := jsonb_set(_audio_mux, ARRAY['external_job_id'], to_jsonb(_external_job_id), true);

  UPDATE public.composer_scenes
  SET pipeline_state = 'complete',
      pipeline_state_at = now(),
      clip_status = 'ready',
      clip_url = _final_url,
      lip_sync_status = 'done',
      lip_sync_applied_at = now(),
      lip_sync_source_clip_url = _scene.dialog_shots->>'source_clip_url',
      twoshot_stage = 'done',
      clip_error = NULL,
      dialog_shots = jsonb_set(
        jsonb_set(
          jsonb_set(
            COALESCE(_scene.dialog_shots, '{}'::jsonb),
            ARRAY['status'], '"done"'::jsonb, true
          ),
          ARRAY['final_url'], to_jsonb(_final_url), true
        ),
        ARRAY['audio_mux'], _audio_mux, true
      ),
      updated_at = now()
  WHERE id = _scene.id;

  SELECT pipeline_state INTO _to_state FROM public.composer_scenes WHERE id = _scene.id;

  INSERT INTO public.composer_scene_transition_log (
    scene_id, project_id, from_state, to_state, step_index, is_intermediate,
    guard_mode, run_id, generation, write_id, applied, reason,
    source_signature, caller_class, caller_role, auth_uid, detail
  ) VALUES (
    _scene.id, _scene.project_id, _from_state, _to_state, 1, false,
    'run_bound', _job.run_id, _job.plate_generation, _write_id, true, 'finalized',
    'g322_stitch_finalize', 'stitch_finalize', _caller_role, auth.uid(),
    jsonb_build_object(
      'pipeline_job_id', _pipeline_job_id,
      'external_job_id', _external_job_id,
      'final_url', _final_url,
      'audio_mux', _audio_mux
    )
  );

  RETURN jsonb_build_object(
    'verdict', 'finalized',
    'scene_id', _scene.id,
    'pipeline_job_id', _pipeline_job_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.composer_finalize_lipsync_scene(uuid, text, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.composer_finalize_lipsync_scene(uuid, text, uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.composer_finalize_lipsync_scene(uuid, text, uuid, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.composer_finalize_lipsync_scene(uuid, text, uuid, text, text) TO service_role;