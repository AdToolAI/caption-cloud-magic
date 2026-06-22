CREATE OR REPLACE FUNCTION public.update_dialog_pass_slot(
  _scene_id uuid, _pass_idx integer, _patch jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _ds jsonb;
  _arr jsonb;
  _new_shots jsonb;
BEGIN
  -- Row-lock serializes parallel pass dispatchers (Plan-D fanout)
  SELECT COALESCE(dialog_shots, '{}'::jsonb) INTO _ds
  FROM public.composer_scenes WHERE id = _scene_id FOR UPDATE;

  _arr := CASE WHEN jsonb_typeof(_ds->'passes') = 'array'
               THEN _ds->'passes' ELSE '[]'::jsonb END;

  -- Pad with {} until index exists; prevents jsonb_set out-of-bounds append bug
  WHILE jsonb_array_length(_arr) <= _pass_idx LOOP
    _arr := _arr || '[{}]'::jsonb;
  END LOOP;

  -- Merge patch into the target slot
  _arr := jsonb_set(_arr, ARRAY[_pass_idx::text],
                    COALESCE(_arr->_pass_idx, '{}'::jsonb) || _patch, true);
  _ds  := jsonb_set(_ds, ARRAY['passes'], _arr, true);

  UPDATE public.composer_scenes
  SET dialog_shots = _ds, updated_at = now()
  WHERE id = _scene_id
  RETURNING dialog_shots INTO _new_shots;

  RETURN _new_shots;
END;
$$;