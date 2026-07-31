CREATE OR REPLACE FUNCTION public.update_dialog_shot_pass(
  p_scene_id uuid,
  p_pass_idx integer,
  p_patch jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ds jsonb;
  v_slot jsonb;
  v_merged jsonb;
BEGIN
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'update_dialog_shot_pass: patch must be a jsonb object';
  END IF;

  SELECT dialog_shots INTO v_ds
  FROM public.composer_scenes
  WHERE id = p_scene_id
  FOR UPDATE;

  IF v_ds IS NULL OR jsonb_typeof(v_ds->'passes') <> 'array' THEN
    RAISE EXCEPTION 'update_dialog_shot_pass: scene % has no passes array', p_scene_id;
  END IF;

  IF p_pass_idx < 0 OR p_pass_idx >= jsonb_array_length(v_ds->'passes') THEN
    RAISE EXCEPTION 'update_dialog_shot_pass: pass_idx % out of range', p_pass_idx;
  END IF;

  v_slot := COALESCE(v_ds->'passes'->p_pass_idx, '{}'::jsonb);
  IF jsonb_typeof(v_slot) <> 'object' THEN
    v_slot := '{}'::jsonb;
  END IF;

  -- Shallow merge: patch wins, everything else on the slot survives.
  v_merged := v_slot || p_patch;

  -- Integrity floor: a slot must always keep its identity keys.
  IF NOT (v_merged ? 'idx') THEN
    v_merged := v_merged || jsonb_build_object('idx', p_pass_idx);
  END IF;

  v_ds := jsonb_set(v_ds, ARRAY['passes', p_pass_idx::text], v_merged, false);

  UPDATE public.composer_scenes
  SET dialog_shots = v_ds,
      updated_at = now()
  WHERE id = p_scene_id;

  RETURN v_merged;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_dialog_shot_pass(uuid, integer, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_dialog_shot_pass(uuid, integer, jsonb) TO authenticated;