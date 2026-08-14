CREATE OR REPLACE FUNCTION public.composer_fail_hybrid_extend_scene(
  _scene_id uuid,
  _run_id uuid,
  _generation integer,
  _write_id text,
  _error_text text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  _res record;
  _cur public.composer_scenes%ROWTYPE;
  _caller_role text;
BEGIN
  IF _run_id IS NULL OR _generation IS NULL THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'missing_run_provenance');
  END IF;

  IF _write_id IS NULL OR _write_id NOT IN (
    'hybrid:frame-extract-failed',
    'hybrid:no-anchor',
    'hybrid:dispatch-failed'
  ) THEN
    SELECT * INTO _cur FROM public.composer_scenes WHERE id = _scene_id;
    _caller_role := coalesce(
      current_setting('request.jwt.claims', true)::jsonb ->> 'role',
      current_setting('request.jwt.claim.role', true),
      ''
    );
    INSERT INTO public.composer_scene_transition_log (
      scene_id, project_id, from_state, to_state, step_index, is_intermediate,
      guard_mode, run_id, generation, write_id, applied, reason,
      source_signature, caller_class, caller_role, auth_uid
    ) VALUES (
      _scene_id, _cur.project_id, _cur.pipeline_state, 'failed', 1, false,
      'run_bound', _run_id, _generation, _write_id, false, 'write_id_not_allowed',
      'v2', 'v2', _caller_role, auth.uid()
    );
    RETURN jsonb_build_object('applied', false, 'reason', 'write_id_not_allowed');
  END IF;

  SELECT * INTO _res FROM public.composer_scene_transition_core(
    _scene_id,
    'failed'::public.composer_scene_state,
    'run_bound',
    _run_id,
    _generation,
    NULL,
    _write_id,
    ARRAY['plate_queued']::public.composer_scene_state[],
    NULL,
    NULL,
    _error_text,
    false,
    false,
    false,
    'v2',
    'v2'
  );

  IF NOT _res.applied THEN
    RETURN jsonb_build_object(
      'applied', false,
      'reason', CASE WHEN _res.reason IN ('unexpected_from_state', 'from_state_mismatch')
                     THEN 'unexpected_state' ELSE _res.reason END,
      'state', _res.state
    );
  END IF;

  UPDATE public.composer_scenes
     SET clip_status = 'failed',
         clip_error = _error_text,
         updated_at = now()
   WHERE id = _scene_id;

  RETURN jsonb_build_object('applied', true, 'reason', 'success', 'state', _res.state);
END;
$function$;

REVOKE ALL ON FUNCTION public.composer_fail_hybrid_extend_scene(uuid, uuid, integer, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.composer_fail_hybrid_extend_scene(uuid, uuid, integer, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.composer_fail_hybrid_extend_scene(uuid, uuid, integer, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.composer_fail_hybrid_extend_scene(uuid, uuid, integer, text, text) TO service_role;