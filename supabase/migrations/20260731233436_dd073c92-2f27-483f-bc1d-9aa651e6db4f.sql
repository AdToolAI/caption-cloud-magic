DROP FUNCTION IF EXISTS public.update_dialog_shot_pass(uuid, integer, jsonb);

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
  _new_shots jsonb;
BEGIN
  IF _patch IS NULL OR jsonb_typeof(_patch) <> 'object' THEN
    RAISE EXCEPTION 'update_dialog_pass_slot: patch must be a jsonb object';
  END IF;

  -- Row-lock serializes parallel pass dispatchers (Plan-D fanout)
  SELECT COALESCE(dialog_shots, '{}'::jsonb) INTO _ds
  FROM public.composer_scenes WHERE id = _scene_id FOR UPDATE;

  _arr := CASE WHEN jsonb_typeof(_ds->'passes') = 'array'
               THEN _ds->'passes' ELSE '[]'::jsonb END;

  -- v343: pad with an IDENTIFIABLE placeholder, never a bare {}.
  -- A bare {} slot has no idx/speaker_idx, which made compose-dialog-segments
  -- block that pass forever with `coords_heuristic_unverified` and left the
  -- scene neither finished nor failed.
  WHILE jsonb_array_length(_arr) <= _pass_idx LOOP
    _arr := _arr || jsonb_build_array(
      jsonb_build_object(
        'idx', jsonb_array_length(_arr),
        'status', 'pending',
        'slot_padded', true
      )
    );
  END LOOP;

  _slot := COALESCE(_arr->_pass_idx, '{}'::jsonb);
  IF jsonb_typeof(_slot) <> 'object' THEN
    _slot := '{}'::jsonb;
  END IF;

  _slot := _slot || _patch;
  IF NOT (_slot ? 'idx') THEN
    _slot := _slot || jsonb_build_object('idx', _pass_idx);
  END IF;
  _slot := _slot - 'slot_padded';

  _arr := jsonb_set(_arr, ARRAY[_pass_idx::text], _slot, true);
  _ds  := jsonb_set(_ds, ARRAY['passes'], _arr, true);

  UPDATE public.composer_scenes
  SET dialog_shots = _ds, updated_at = now()
  WHERE id = _scene_id
  RETURNING dialog_shots INTO _new_shots;

  RETURN _new_shots;
END;
$function$;