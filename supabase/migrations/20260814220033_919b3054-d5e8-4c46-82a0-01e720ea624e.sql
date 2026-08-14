-- v431 G2.2 — atomare Primitive für Talking-Head und Motion-Probe-Hard-Fail.
-- Beide Primitive respektieren unter demselben Row Lock die
-- composer_scene_transitions-Zulässigkeit (via composer_scene_transition_core,
-- caller_class 'v2') und protokollieren im bestehenden Transition-Audit.

CREATE OR REPLACE FUNCTION public.composer_finalize_talking_head(
  _scene_id uuid,
  _mode text,
  _run_id uuid,
  _generation integer,
  _write_id text,
  _base_url text DEFAULT NULL,
  _error_text text DEFAULT NULL,
  _character_image_url text DEFAULT NULL,
  _character_audio_url text DEFAULT NULL,
  _character_voice_id text DEFAULT NULL,
  _character_script text DEFAULT NULL,
  _talking_head_aspect text DEFAULT NULL,
  _talking_head_resolution text DEFAULT NULL,
  _replicate_prediction_id text DEFAULT NULL,
  _mentioned_character_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _to public.composer_scene_state;
  _from public.composer_scene_state[];
  _res record;
  _clip_status text;
BEGIN
  IF _run_id IS NULL OR _generation IS NULL THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'missing_run_provenance');
  END IF;

  IF _mode = 'start' THEN
    _to := 'plate_rendering';
    _from := ARRAY['idle','plate_queued','plate_rendering','plate_ready']::public.composer_scene_state[];
    _clip_status := 'generating';
  ELSIF _mode = 'complete' THEN
    _to := 'plate_ready';
    _from := ARRAY['plate_rendering']::public.composer_scene_state[];
    _clip_status := 'ready';
  ELSIF _mode = 'fail' THEN
    _to := 'failed';
    _from := ARRAY['idle','plate_queued','plate_rendering','plate_ready']::public.composer_scene_state[];
    _clip_status := 'failed';
  ELSE
    RETURN jsonb_build_object('applied', false, 'reason', 'invalid_mode');
  END IF;

  SELECT * INTO _res FROM public.composer_scene_transition_core(
    _scene_id, _to, 'run_bound', _run_id, _generation, NULL, _write_id,
    _from, NULL, NULL, _error_text, false, false, false, 'v2', 'v2'
  );

  IF NOT _res.applied THEN
    RETURN jsonb_build_object('applied', false, 'reason', _res.reason, 'state', _res.state);
  END IF;

  -- Gleicher Row Lock, gleiche Transaktion: Output + Legacy-Spiegel.
  IF _mode = 'start' THEN
    UPDATE public.composer_scenes
    SET clip_status = _clip_status,
        base_video_url = NULL,
        processed_video_url = NULL,
        clip_url = NULL,
        character_image_url = COALESCE(_character_image_url, character_image_url),
        character_audio_url = COALESCE(_character_audio_url, character_audio_url),
        character_voice_id = COALESCE(_character_voice_id, character_voice_id),
        character_script = COALESCE(_character_script, character_script),
        talking_head_aspect = COALESCE(_talking_head_aspect, talking_head_aspect),
        talking_head_resolution = COALESCE(_talking_head_resolution, talking_head_resolution),
        replicate_prediction_id = COALESCE(_replicate_prediction_id, replicate_prediction_id),
        mentioned_character_ids = COALESCE(_mentioned_character_ids, mentioned_character_ids),
        updated_at = now()
    WHERE id = _scene_id;
  ELSIF _mode = 'complete' THEN
    UPDATE public.composer_scenes
    SET clip_status = _clip_status,
        base_video_url = _base_url,
        processed_video_url = NULL,
        clip_url = _base_url,
        updated_at = now()
    WHERE id = _scene_id;
  ELSE
    UPDATE public.composer_scenes
    SET clip_status = _clip_status,
        updated_at = now()
    WHERE id = _scene_id;
  END IF;

  RETURN jsonb_build_object('applied', true, 'reason', 'success', 'state', _res.state);
END;
$function$;

REVOKE ALL ON FUNCTION public.composer_finalize_talking_head(uuid, text, uuid, integer, text, text, text, text, text, text, text, text, text, text, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.composer_finalize_talking_head(uuid, text, uuid, integer, text, text, text, text, text, text, text, text, text, text, uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.composer_fail_scene_with_mirrors(
  _scene_id uuid,
  _run_id uuid,
  _generation integer,
  _write_id text,
  _error_text text,
  _substate text DEFAULT NULL,
  _lip_sync_status text DEFAULT NULL,
  _twoshot_stage text DEFAULT NULL,
  _clip_status text DEFAULT NULL
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
  SET lip_sync_status = COALESCE(_lip_sync_status, lip_sync_status),
      twoshot_stage = COALESCE(_twoshot_stage, twoshot_stage),
      clip_status = COALESCE(_clip_status, clip_status),
      updated_at = now()
  WHERE id = _scene_id;

  RETURN jsonb_build_object('applied', true, 'reason', 'success', 'state', _res.state, 'substate', _res.substate);
END;
$function$;

REVOKE ALL ON FUNCTION public.composer_fail_scene_with_mirrors(uuid, uuid, integer, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.composer_fail_scene_with_mirrors(uuid, uuid, integer, text, text, text, text, text, text) TO service_role;

-- v431 G2.2 — job_id-Immutability im Pass-Slot: einmal gesetzt, darf sie nur
-- durch einen expliziten Reset (job_id := null) wieder freigegeben werden.
CREATE OR REPLACE FUNCTION public.update_dialog_pass_slot(_scene_id uuid, _pass_idx integer, _patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _ds jsonb;
  _arr jsonb;
  _slot jsonb;
  _new_status text;
  _old_status text;
  _new_shots jsonb;
BEGIN
  IF _patch IS NULL OR jsonb_typeof(_patch) <> 'object' THEN
    RAISE EXCEPTION 'update_dialog_pass_slot: patch must be a jsonb object';
  END IF;

  SELECT COALESCE(dialog_shots, '{}'::jsonb) INTO _ds
  FROM public.composer_scenes WHERE id = _scene_id FOR UPDATE;

  _arr := CASE WHEN jsonb_typeof(_ds->'passes') = 'array'
               THEN _ds->'passes' ELSE '[]'::jsonb END;
  WHILE jsonb_array_length(_arr) <= _pass_idx LOOP
    _arr := _arr || jsonb_build_array(jsonb_build_object(
      'idx', jsonb_array_length(_arr), 'status', 'pending', 'slot_padded', true
    ));
  END LOOP;

  _slot := COALESCE(_arr->_pass_idx, '{}'::jsonb);
  IF jsonb_typeof(_slot) <> 'object' THEN _slot := '{}'::jsonb; END IF;
  _old_status := COALESCE(_slot->>'status', 'pending');
  _new_status := COALESCE(_patch->>'status', _old_status);

  IF _old_status IN ('done', 'failed', 'completed', 'cancelled')
     AND _new_status IN ('pending', 'queued', 'rendering', 'processing', 'running') THEN
    _patch := _patch - 'status' - 'output_url' - 'finished_at' - 'error';
  END IF;

  -- v431 G2.1 — Run-Provenienz ist unveraenderlich: einmal gesetzt, darf ein
  -- spaeterer Patch `run_id` / `plate_generation` nie wieder ueberschreiben.
  IF _slot ? 'run_id' AND _slot->'run_id' <> 'null'::jsonb THEN
    _patch := _patch - 'run_id';
  END IF;
  IF _slot ? 'plate_generation' AND _slot->'plate_generation' <> 'null'::jsonb THEN
    _patch := _patch - 'plate_generation';
  END IF;

  -- v431 G2.2 — job_id ist ebenfalls unveraenderlich, sobald gesetzt. Einziger
  -- erlaubter Weg zurueck ist der explizite Reset (`job_id: null`).
  IF _slot ? 'job_id' AND _slot->'job_id' <> 'null'::jsonb
     AND _patch ? 'job_id' AND _patch->'job_id' <> 'null'::jsonb THEN
    _patch := _patch - 'job_id';
  END IF;

  _slot := (_slot || _patch || jsonb_build_object('idx', _pass_idx)) - 'slot_padded';
  _arr := jsonb_set(_arr, ARRAY[_pass_idx::text], _slot, true);
  _ds := jsonb_set(_ds, ARRAY['passes'], _arr, true);

  UPDATE public.composer_scenes
  SET dialog_shots = _ds, updated_at = now()
  WHERE id = _scene_id
  RETURNING dialog_shots INTO _new_shots;
  RETURN _new_shots;
END;
$function$;