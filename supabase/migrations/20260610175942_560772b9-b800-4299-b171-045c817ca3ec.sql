
-- Plan D Phase 1: atomic per-pass slot update + mux claim + parallel flags

-- (1) Atomic per-pass slot patch — avoids JSONB lost-update when parallel
--     Sync.so webhooks complete for different passes near-simultaneously.
CREATE OR REPLACE FUNCTION public.update_dialog_pass_slot(
  _scene_id uuid,
  _pass_idx int,
  _patch jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_shots jsonb;
BEGIN
  UPDATE public.composer_scenes
  SET dialog_shots = jsonb_set(
        COALESCE(dialog_shots, '{}'::jsonb),
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

REVOKE ALL ON FUNCTION public.update_dialog_pass_slot(uuid, int, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_dialog_pass_slot(uuid, int, jsonb) TO service_role;

-- (2) Atomic mux-dispatch claim — first caller wins, others get false. Used
--     when N passes complete in parallel and N webhooks all see allDone.
CREATE OR REPLACE FUNCTION public.try_claim_mux_dispatch(_scene_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _claimed boolean := false;
BEGIN
  UPDATE public.composer_scenes
  SET dialog_shots = jsonb_set(
        COALESCE(dialog_shots, '{}'::jsonb),
        ARRAY['audio_mux','dispatched_at'],
        to_jsonb(now()::text),
        true
      ),
      updated_at = now()
  WHERE id = _scene_id
    AND COALESCE(dialog_shots->'audio_mux'->>'dispatched_at', '') = '';
  GET DIAGNOSTICS _claimed = ROW_COUNT;
  RETURN _claimed;
END;
$$;

REVOKE ALL ON FUNCTION public.try_claim_mux_dispatch(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.try_claim_mux_dispatch(uuid) TO service_role;

-- (3) Feature flags (both OFF — pipeline behavior unchanged until explicitly enabled)
INSERT INTO public.system_config (key, value, description)
VALUES
  ('composer.parallel_sync_so_passes', 'false'::jsonb,
   'Plan D: when true, compose-dialog-segments dispatches Sync.so passes in parallel up to composer.sync_so_concurrency_cap. Default OFF — serial v60 path stays active.'),
  ('composer.sync_so_concurrency_cap', '2'::jsonb,
   'Plan D: max parallel Sync.so passes dispatched per scene. Starts at 2 for safety; raise to 3 then 4 after staged rollout.')
ON CONFLICT (key) DO NOTHING;
