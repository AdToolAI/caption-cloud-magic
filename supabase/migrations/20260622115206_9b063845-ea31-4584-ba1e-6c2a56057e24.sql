-- Phase 1: Per-Slot-Write RPC for dialog_shots root-level merge.
-- Used by compose-dialog-segments to safely merge cost_credits / fallback_history
-- without overwriting concurrent sibling-pass writes inside dialog_shots.passes[].
CREATE OR REPLACE FUNCTION public.update_dialog_shots_root_merge(
  _scene_id uuid,
  _patch jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _new_shots jsonb;
BEGIN
  -- Atomic root-level merge that PRESERVES the entire `passes` array.
  -- _patch may contain keys like cost_credits, fallback_history etc., but
  -- must NEVER contain `passes` (caller responsibility — we strip defensively).
  UPDATE public.composer_scenes
  SET dialog_shots = COALESCE(dialog_shots, '{}'::jsonb)
                     || (_patch - 'passes'),
      updated_at = now()
  WHERE id = _scene_id
  RETURNING dialog_shots INTO _new_shots;
  RETURN _new_shots;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.update_dialog_shots_root_merge(uuid, jsonb) TO authenticated, service_role;