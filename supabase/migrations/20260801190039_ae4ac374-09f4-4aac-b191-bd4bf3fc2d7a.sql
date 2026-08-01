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

REVOKE ALL ON FUNCTION public.update_dialog_pass_slot(uuid, integer, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_dialog_pass_slot(uuid, integer, jsonb) TO service_role;