-- S1: remove ambiguous 9-arg overload (PGRST203)
DROP FUNCTION IF EXISTS public.composer_fail_scene_with_mirrors(uuid,uuid,integer,text,text,text,text,text,text);

-- S1: bind _clear_lip_sync_fields to a closed write_id allowlist
CREATE OR REPLACE FUNCTION public.composer_fail_scene_with_mirrors(
  _scene_id uuid,
  _run_id uuid,
  _generation integer,
  _write_id text,
  _error_text text,
  _substate text DEFAULT NULL::text,
  _lip_sync_status text DEFAULT NULL::text,
  _twoshot_stage text DEFAULT NULL::text,
  _clip_status text DEFAULT NULL::text,
  _clear_lip_sync_fields boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _res record;
  _cur public.composer_scenes%ROWTYPE;
  _caller_role text;
BEGIN
  IF _run_id IS NULL OR _generation IS NULL THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'missing_run_provenance');
  END IF;

  -- closed allowlist for the destructive clear option
  IF _clear_lip_sync_fields AND _write_id IS DISTINCT FROM 'cvc:failed/pika' THEN
    _caller_role := coalesce(
      current_setting('request.jwt.claims', true)::jsonb ->> 'role',
      current_setting('request.jwt.claim.role', true),
      ''
    );
    SELECT * INTO _cur FROM public.composer_scenes WHERE id = _scene_id;
    INSERT INTO public.composer_scene_transition_log (
      scene_id, project_id, from_state, to_state, step_index, is_intermediate,
      guard_mode, run_id, generation, write_id, applied, reason,
      source_signature, caller_class, caller_role, auth_uid
    )
    VALUES (
      _scene_id, _cur.project_id, _cur.pipeline_state, 'failed', 1, false,
      'run_bound', _run_id, _generation, _write_id, false, 'clear_flag_not_allowed',
      'v2', 'v2', _caller_role, auth.uid()
    );
    RETURN jsonb_build_object('applied', false, 'reason', 'clear_flag_not_allowed');
  END IF;

  SELECT * INTO _res FROM public.composer_scene_transition_core(
    _scene_id, 'failed'::public.composer_scene_state, 'run_bound', _run_id, _generation, NULL, _write_id,
    NULL, NULL, _substate, _error_text, false, false, false, 'v2', 'v2'
  );

  IF NOT _res.applied THEN
    RETURN jsonb_build_object('applied', false, 'reason', _res.reason, 'state', _res.state);
  END IF;

  UPDATE public.composer_scenes
  SET lip_sync_status = CASE WHEN _clear_lip_sync_fields THEN NULL ELSE COALESCE(_lip_sync_status, lip_sync_status) END,
      twoshot_stage = CASE WHEN _clear_lip_sync_fields THEN NULL ELSE COALESCE(_twoshot_stage, twoshot_stage) END,
      lip_sync_source_clip_url = CASE WHEN _clear_lip_sync_fields THEN NULL ELSE lip_sync_source_clip_url END,
      dialog_shots = CASE WHEN _clear_lip_sync_fields THEN NULL ELSE dialog_shots END,
      clip_status = COALESCE(_clip_status, clip_status),
      updated_at = now()
  WHERE id = _scene_id;

  RETURN jsonb_build_object('applied', true, 'reason', 'success', 'state', _res.state, 'substate', _res.substate);
END;
$function$;

NOTIFY pgrst, 'reload schema';