-- v431 G2.3 — Erweiterung von composer_fail_scene_with_mirrors um ein
-- optionales Flag zum Zurücksetzen der Lip-Sync-Legacy-Felder im selben
-- atomaren Write.

CREATE OR REPLACE FUNCTION public.composer_fail_scene_with_mirrors(
  _scene_id uuid,
  _run_id uuid,
  _generation integer,
  _write_id text,
  _error_text text,
  _substate text DEFAULT NULL,
  _lip_sync_status text DEFAULT NULL,
  _twoshot_stage text DEFAULT NULL,
  _clip_status text DEFAULT NULL,
  _clear_lip_sync_fields boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _res record;
BEGIN
  IF _run_id IS NULL OR _generation IS NULL THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'missing_run_provenance');
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

REVOKE ALL ON FUNCTION public.composer_fail_scene_with_mirrors(uuid, uuid, integer, text, text, text, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.composer_fail_scene_with_mirrors(uuid, uuid, integer, text, text, text, text, text, text, boolean) TO service_role;
