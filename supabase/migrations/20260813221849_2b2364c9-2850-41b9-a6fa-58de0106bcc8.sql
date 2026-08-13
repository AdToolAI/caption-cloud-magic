-- v430 Step 5C — pipeline_substate as diagnostic/UI sub-state

-- ------------------------------------------------------------
-- 1. New columns
-- ------------------------------------------------------------
ALTER TABLE public.composer_scenes
  ADD COLUMN IF NOT EXISTS pipeline_substate text,
  ADD COLUMN IF NOT EXISTS pipeline_substate_at timestamptz;

-- ------------------------------------------------------------
-- 2. Helper: derive a substate from legacy columns
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.composer_substate_from_legacy(
  _clip_status text,
  _twoshot_stage text,
  _lip_sync_status text
) RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _clip_status = 'awaiting_manual_face_map' THEN 'awaiting_manual_face_map'
    WHEN _clip_status = 'awaiting_confirmation' AND _twoshot_stage = 'preview' THEN 'awaiting_confirmation'
    WHEN _twoshot_stage LIKE 'syncso_pass_%' THEN _twoshot_stage
    WHEN _twoshot_stage LIKE 'syncso_fanout_%' THEN _twoshot_stage
    WHEN _twoshot_stage LIKE 'syncso_retry_%' THEN _twoshot_stage
    WHEN _twoshot_stage = 'circuit_open' THEN 'circuit_open'
    WHEN _twoshot_stage = 'deferred' THEN 'deferred'
    WHEN _twoshot_stage = 'needs_clip_rerender' THEN 'needs_clip_rerender'
    WHEN _twoshot_stage = 'anchor' THEN 'anchor'
    WHEN _twoshot_stage = 'anchor_soft_pass' THEN 'anchor_soft_pass'
    WHEN _twoshot_stage = 'preview' THEN 'preview'
    WHEN _twoshot_stage = 'audio_mux_failed' THEN 'audio_mux_failed'
    WHEN _twoshot_stage = 'failed' AND _lip_sync_status = 'failed' THEN 'lipsync_failed'
    ELSE NULL
  END;
$$;

-- ------------------------------------------------------------
-- 3. Bridge: mirror substate alongside state
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.composer_scene_state_bridge()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  legacy_changed boolean;
  state_changed boolean;
  substate_changed boolean;
  derived public.composer_scene_state;
  derived_substate text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.pipeline_state = 'idle' THEN
      NEW.pipeline_state := public.composer_state_from_legacy(
        NEW.clip_status, NEW.twoshot_stage, NEW.lip_sync_status,
        NEW.clip_url, NEW.active_run_id, NEW.audio_plan);
    END IF;
    NEW.pipeline_substate := COALESCE(
      NEW.pipeline_substate,
      public.composer_substate_from_legacy(NEW.clip_status, NEW.twoshot_stage, NEW.lip_sync_status)
    );
    NEW.pipeline_state_at := now();
    NEW.pipeline_substate_at := now();
    RETURN NEW;
  END IF;

  state_changed := NEW.pipeline_state IS DISTINCT FROM OLD.pipeline_state;
  legacy_changed :=
    NEW.clip_status     IS DISTINCT FROM OLD.clip_status
    OR NEW.twoshot_stage   IS DISTINCT FROM OLD.twoshot_stage
    OR NEW.lip_sync_status IS DISTINCT FROM OLD.lip_sync_status
    OR NEW.clip_url        IS DISTINCT FROM OLD.clip_url;
  substate_changed := NEW.pipeline_substate IS DISTINCT FROM OLD.pipeline_substate;

  -- New-path write: state changed. Sync legacy columns if they weren't touched,
  -- and accept an explicit substate if provided.
  IF state_changed THEN
    IF NOT legacy_changed THEN
      CASE NEW.pipeline_state
        WHEN 'idle' THEN
          NEW.clip_status := 'pending'; NEW.twoshot_stage := NULL; NEW.lip_sync_status := NULL;
        WHEN 'plate_queued' THEN
          NEW.clip_status := 'queued'; NEW.twoshot_stage := NULL; NEW.lip_sync_status := NULL;
        WHEN 'plate_rendering' THEN
          NEW.clip_status := 'generating'; NEW.twoshot_stage := NULL; NEW.lip_sync_status := NULL;
        WHEN 'plate_ready' THEN
          NEW.clip_status := 'ready'; NEW.twoshot_stage := NULL;
        WHEN 'audio_prep' THEN
          NEW.clip_status := 'ready'; NEW.twoshot_stage := 'audio';
        WHEN 'audio_ready' THEN
          NEW.clip_status := 'ready'; NEW.twoshot_stage := 'master_clip';
        WHEN 'lipsync_dispatched' THEN
          NEW.clip_status := 'ready'; NEW.twoshot_stage := 'lipsync'; NEW.lip_sync_status := 'running';
        WHEN 'lipsync_running' THEN
          NEW.clip_status := 'ready'; NEW.twoshot_stage := 'lipsync'; NEW.lip_sync_status := 'running';
        WHEN 'lipsync_muxing' THEN
          NEW.clip_status := 'ready'; NEW.twoshot_stage := 'lipsync'; NEW.lip_sync_status := 'stitching';
        WHEN 'complete' THEN
          NEW.clip_status := 'ready'; NEW.twoshot_stage := 'done';
          IF NEW.lip_sync_status IS NOT NULL THEN NEW.lip_sync_status := 'done'; END IF;
        WHEN 'failed' THEN
          NEW.twoshot_stage := 'failed';
          IF NEW.clip_url IS NULL OR length(NEW.clip_url) = 0 THEN
            NEW.clip_status := 'failed';
          END IF;
          IF NEW.lip_sync_status IS NOT NULL THEN NEW.lip_sync_status := 'failed'; END IF;
        WHEN 'canceled' THEN
          NEW.clip_status := 'canceled';
          IF NEW.lip_sync_status IS NOT NULL THEN NEW.lip_sync_status := 'canceled'; END IF;
        ELSE
          NULL;
      END CASE;
    END IF;
    NEW.pipeline_state_at := now();
    -- If the new-path writer did not provide a substate, clear it on terminal/main states
    -- (the legacy mirror above already encodes the detail in twoshot_stage for lip-sync).
    IF NEW.pipeline_substate IS NULL THEN
      NEW.pipeline_substate_at := now();
    END IF;

  ELSIF legacy_changed OR (NEW.clip_url IS DISTINCT FROM OLD.clip_url) THEN
    -- Old-path write: derive state and substate from legacy columns.
    derived := public.composer_state_from_legacy(
      NEW.clip_status, NEW.twoshot_stage, NEW.lip_sync_status,
      NEW.clip_url, NEW.active_run_id, NEW.audio_plan);

    -- v398: The rolled-back lip-sync chain writes legacy columns. The v387 block
    -- (legacy may not raise into audio/lip-sync phases) is lifted so scenes do not
    -- get stuck at "Lip-Sync wird gestartet".
    IF derived IS DISTINCT FROM NEW.pipeline_state THEN
      NEW.pipeline_state := derived;
      NEW.pipeline_state_at := now();
    END IF;

    derived_substate := public.composer_substate_from_legacy(
      NEW.clip_status, NEW.twoshot_stage, NEW.lip_sync_status);
    IF derived_substate IS DISTINCT FROM NEW.pipeline_substate THEN
      NEW.pipeline_substate := derived_substate;
      NEW.pipeline_substate_at := now();
    END IF;
  END IF;

  -- If an explicit substate was provided alongside a state change, keep it and stamp it.
  IF substate_changed AND NEW.pipeline_substate IS NOT NULL THEN
    NEW.pipeline_substate_at := now();
  END IF;

  RETURN NEW;
END;
$$;

-- Re-create trigger so the new function body is bound (CREATE OR REPLACE on the
-- function is enough, but being explicit keeps migrations idempotent).
DROP TRIGGER IF EXISTS trg_composer_scene_state_bridge ON public.composer_scenes;
CREATE TRIGGER trg_composer_scene_state_bridge
  BEFORE INSERT OR UPDATE ON public.composer_scenes
  FOR EACH ROW EXECUTE FUNCTION public.composer_scene_state_bridge();

-- ------------------------------------------------------------
-- 4. Transition RPC: accept optional substate
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.composer_scene_transition(
  _scene_id uuid,
  _to public.composer_scene_state,
  _from public.composer_scene_state[] DEFAULT NULL,
  _detail text DEFAULT NULL,
  _run_id uuid DEFAULT NULL,
  _generation integer DEFAULT NULL,
  _substate text DEFAULT NULL
)
RETURNS TABLE(applied boolean, state public.composer_scene_state, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cur public.composer_scenes%ROWTYPE;
  allowed boolean;
BEGIN
  SELECT * INTO cur FROM public.composer_scenes WHERE id = _scene_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::public.composer_scene_state, 'scene_not_found';
    RETURN;
  END IF;

  IF auth.uid() IS NOT NULL AND NOT public.can_edit_composer_project(cur.project_id, auth.uid()) THEN
    RETURN QUERY SELECT false, cur.pipeline_state, 'forbidden';
    RETURN;
  END IF;

  IF _run_id IS NOT NULL AND cur.active_run_id IS DISTINCT FROM _run_id THEN
    RETURN QUERY SELECT false, cur.pipeline_state, 'stale_run';
    RETURN;
  END IF;

  IF _generation IS NOT NULL AND cur.plate_generation IS DISTINCT FROM _generation THEN
    RETURN QUERY SELECT false, cur.pipeline_state, 'stale_generation';
    RETURN;
  END IF;

  IF _from IS NOT NULL AND array_length(_from, 1) IS NOT NULL
     AND NOT (cur.pipeline_state = ANY(_from)) THEN
    RETURN QUERY SELECT false, cur.pipeline_state, 'unexpected_state';
    RETURN;
  END IF;

  IF cur.pipeline_state = _to THEN
    SELECT EXISTS (
      SELECT 1 FROM public.composer_scene_transitions
      WHERE from_state = cur.pipeline_state AND to_state = _to
    ) INTO allowed;
    IF NOT allowed THEN
      RETURN QUERY SELECT false, cur.pipeline_state, 'noop_same_state';
      RETURN;
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.composer_scene_transitions
    WHERE from_state = cur.pipeline_state AND to_state = _to
  ) INTO allowed;

  IF NOT allowed THEN
    RAISE LOG 'v384_forbidden_transition scene=% from=% to=%', _scene_id, cur.pipeline_state, _to;
    RETURN QUERY SELECT false, cur.pipeline_state, 'transition_not_allowed';
    RETURN;
  END IF;

  UPDATE public.composer_scenes
  SET pipeline_state = _to,
      pipeline_detail = COALESCE(_detail, pipeline_detail),
      pipeline_state_run_id = COALESCE(_run_id, active_run_id),
      pipeline_substate = COALESCE(_substate, pipeline_substate),
      updated_at = now()
  WHERE id = _scene_id;

  RETURN QUERY SELECT true, _to, NULL::text;
END;
$$;

REVOKE ALL ON FUNCTION public.composer_scene_transition(uuid, public.composer_scene_state, public.composer_scene_state[], text, uuid, integer, text) FROM public;
GRANT EXECUTE ON FUNCTION public.composer_scene_transition(uuid, public.composer_scene_state, public.composer_scene_state[], text, uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.composer_scene_transition(uuid, public.composer_scene_state, public.composer_scene_state[], text, uuid, integer, text) TO service_role;

-- Backfill substate for existing rows (idempotent, only fills NULL values)
UPDATE public.composer_scenes
SET pipeline_substate = public.composer_substate_from_legacy(clip_status, twoshot_stage, lip_sync_status),
    pipeline_substate_at = COALESCE(pipeline_substate_at, updated_at, now())
WHERE pipeline_substate IS NULL;
