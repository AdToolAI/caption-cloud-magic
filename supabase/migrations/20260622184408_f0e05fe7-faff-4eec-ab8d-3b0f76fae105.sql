CREATE OR REPLACE FUNCTION public.update_dialog_pass_slot(
  _scene_id uuid, _pass_idx integer, _patch jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _new_shots jsonb;
BEGIN
  UPDATE public.composer_scenes
  SET dialog_shots = jsonb_set(
        jsonb_set(
          COALESCE(dialog_shots, '{}'::jsonb),
          ARRAY['passes'],
          CASE
            WHEN jsonb_typeof(dialog_shots->'passes') = 'array'
              THEN dialog_shots->'passes'
            ELSE '[]'::jsonb
          END,
          true
        ),
        ARRAY['passes', _pass_idx::text],
        COALESCE(dialog_shots->'passes'->_pass_idx, '{}'::jsonb) || _patch,
        true
      ),
      updated_at = now()
  WHERE id = _scene_id
  RETURNING dialog_shots INTO _new_shots;
  RETURN _new_shots;
END;
$$;