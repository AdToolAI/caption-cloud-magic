-- v431 G2.3 — Domain-Primitive zum atomischen Abschließen von Upload-Szenen.
--
-- Scope: exakt ein neues Primitive `composer_finalize_upload_scene`, genutzt
-- durch `compose-video-clips` bei `write_id='cvc:upload-complete'`.
--
-- Eigenschaften:
--   • SECURITY DEFINER + search_path = pg_catalog, public
--   • Row Lock auf composer_scenes
--   • Run + Generation Pflicht; sie werden gegen active_run_id / plate_generation geprüft
--   • From-Set streng auf {idle, plate_queued} beschränkt
--   • Keine neuen globalen Transition-Kanten; das Primitive schreibt direkt
--     pipeline_state = 'complete' unter dem Lock
--   • Legacy-Spiegel (base_video_url, processed_video_url, clip_url, clip_status)
--     werden im selben UPDATE atomar mitgeschrieben
--   • Jeder Versuch (applied=true und applied=false) landet im Transition-Audit

CREATE OR REPLACE FUNCTION public.composer_finalize_upload_scene(
  _scene_id uuid,
  _run_id uuid,
  _generation integer,
  _write_id text,
  _upload_url text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _cur public.composer_scenes%ROWTYPE;
  _caller_role text;
  _auth_uid uuid;
  _reason text := NULL;
  _from public.composer_scene_state[] := ARRAY['idle','plate_queued']::public.composer_scene_state[];
BEGIN
  IF _write_id IS DISTINCT FROM 'cvc:upload-complete' THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'invalid_write_id', 'expected', 'cvc:upload-complete');
  END IF;

  IF _run_id IS NULL OR _generation IS NULL THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'missing_run_provenance');
  END IF;

  _caller_role := coalesce(
    current_setting('request.jwt.claims', true)::jsonb ->> 'role',
    current_setting('request.jwt.claim.role', true),
    ''
  );

  SELECT * INTO _cur FROM public.composer_scenes WHERE id = _scene_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'scene_not_found');
  END IF;

  IF _caller_role != 'service_role' THEN
    _auth_uid := (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')::uuid;
    IF _auth_uid IS NULL THEN
      _reason := 'forbidden';
    ELSIF NOT public.can_edit_composer_project(_cur.project_id, _auth_uid) THEN
      _reason := 'forbidden';
    END IF;
  END IF;

  IF _reason IS NULL THEN
    IF _cur.active_run_id IS DISTINCT FROM _run_id THEN
      _reason := 'stale_run';
    ELSIF _cur.plate_generation IS DISTINCT FROM _generation THEN
      _reason := 'stale_generation';
    ELSIF NOT (_cur.pipeline_state = ANY(_from)) THEN
      _reason := 'unexpected_state';
    END IF;
  END IF;

  IF _reason IS NOT NULL THEN
    INSERT INTO public.composer_scene_transition_log (
      scene_id, project_id, from_state, to_state, step_index, is_intermediate,
      guard_mode, run_id, generation, write_id, applied, reason,
      source_signature, caller_class, caller_role, auth_uid
    )
    VALUES (
      _scene_id, _cur.project_id, _cur.pipeline_state, 'complete', 1, false,
      'run_bound', _run_id, _generation, _write_id, false, _reason,
      'v2', 'v2', _caller_role, auth.uid()
    );
    RETURN jsonb_build_object('applied', false, 'reason', _reason, 'state', _cur.pipeline_state);
  END IF;

  UPDATE public.composer_scenes
  SET pipeline_state = 'complete',
      pipeline_substate = NULL,
      pipeline_detail = NULL,
      clip_error = NULL,
      pipeline_state_at = now(),
      pipeline_state_run_id = _run_id,
      base_video_url = _upload_url,
      processed_video_url = NULL,
      clip_url = _upload_url,
      clip_status = 'ready',
      updated_at = now()
  WHERE id = _scene_id;

  INSERT INTO public.composer_scene_transition_log (
    scene_id, project_id, from_state, to_state, step_index, is_intermediate,
    guard_mode, run_id, generation, write_id, applied,
    source_signature, caller_class, caller_role, auth_uid
  )
  VALUES (
    _scene_id, _cur.project_id, _cur.pipeline_state, 'complete', 1, false,
    'run_bound', _run_id, _generation, _write_id, true,
    'v2', 'v2', _caller_role, auth.uid()
  );

  RETURN jsonb_build_object('applied', true, 'reason', 'success', 'state', 'complete');
END;
$function$;

REVOKE ALL ON FUNCTION public.composer_finalize_upload_scene(uuid, uuid, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.composer_finalize_upload_scene(uuid, uuid, integer, text, text) TO service_role;
