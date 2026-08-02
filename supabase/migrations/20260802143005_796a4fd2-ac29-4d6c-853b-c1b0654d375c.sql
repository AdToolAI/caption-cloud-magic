-- ============================================================
-- v384 P0 — Enum-Statusmaschine für composer_scenes
-- ============================================================

CREATE TYPE public.composer_scene_state AS ENUM (
  'idle',
  'plate_queued',
  'plate_rendering',
  'plate_ready',
  'audio_prep',
  'audio_ready',
  'lipsync_dispatched',
  'lipsync_running',
  'lipsync_muxing',
  'complete',
  'failed',
  'canceled'
);

ALTER TABLE public.composer_scenes
  ADD COLUMN IF NOT EXISTS pipeline_state public.composer_scene_state NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS pipeline_detail text,
  ADD COLUMN IF NOT EXISTS pipeline_state_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS pipeline_state_run_id uuid;

CREATE INDEX IF NOT EXISTS idx_composer_scenes_pipeline_state
  ON public.composer_scenes (pipeline_state, pipeline_state_at DESC);

-- ------------------------------------------------------------
-- Erlaubte Übergänge
-- ------------------------------------------------------------
CREATE TABLE public.composer_scene_transitions (
  from_state public.composer_scene_state NOT NULL,
  to_state   public.composer_scene_state NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (from_state, to_state)
);

GRANT SELECT ON public.composer_scene_transitions TO authenticated;
GRANT SELECT ON public.composer_scene_transitions TO anon;
GRANT ALL ON public.composer_scene_transitions TO service_role;
ALTER TABLE public.composer_scene_transitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transitions readable by everyone"
  ON public.composer_scene_transitions FOR SELECT
  USING (true);

-- Vorwärtspfad
INSERT INTO public.composer_scene_transitions (from_state, to_state) VALUES
  ('idle','plate_queued'),
  ('plate_queued','plate_rendering'),
  ('plate_queued','plate_ready'),
  ('plate_rendering','plate_ready'),
  ('plate_ready','audio_prep'),
  ('audio_prep','audio_ready'),
  ('audio_ready','lipsync_dispatched'),
  ('lipsync_dispatched','lipsync_running'),
  ('lipsync_running','lipsync_muxing'),
  ('lipsync_dispatched','lipsync_muxing'),
  ('lipsync_muxing','complete'),
  -- Szenen ohne Lip-Sync sind mit fertiger Plate abgeschlossen
  ('plate_ready','complete'),
  -- Reprise: nach einem abgeschlossenen Lauf darf derselbe Schritt erneut laufen
  ('audio_prep','audio_prep'),
  ('lipsync_dispatched','lipsync_dispatched'),
  ('lipsync_running','lipsync_running'),
  ('plate_rendering','plate_rendering');

-- Terminale Übergänge: aus jedem nicht-terminalen Zustand erreichbar
INSERT INTO public.composer_scene_transitions (from_state, to_state)
SELECT s, t
FROM unnest(ARRAY[
  'idle','plate_queued','plate_rendering','plate_ready',
  'audio_prep','audio_ready','lipsync_dispatched',
  'lipsync_running','lipsync_muxing','complete'
]::public.composer_scene_state[]) s
CROSS JOIN unnest(ARRAY['failed','canceled']::public.composer_scene_state[]) t
ON CONFLICT DO NOTHING;

-- Hard-Reset ist der EINZIGE Weg aus einem terminalen Zustand heraus
INSERT INTO public.composer_scene_transitions (from_state, to_state) VALUES
  ('failed','plate_queued'),
  ('canceled','plate_queued'),
  ('complete','plate_queued'),
  ('failed','idle'),
  ('canceled','idle'),
  ('complete','idle')
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- Ableitung: Legacy-Spalten  ->  Zustand
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.composer_state_from_legacy(
  _clip_status text,
  _twoshot_stage text,
  _lip_sync_status text,
  _clip_url text,
  _active_run_id uuid,
  _audio_plan jsonb
) RETURNS public.composer_scene_state
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _clip_status = 'canceled' OR _lip_sync_status = 'canceled' THEN 'canceled'
    WHEN _clip_status = 'failed'
      OR _twoshot_stage IN ('failed','audio_mux_failed')
      OR _lip_sync_status = 'failed' THEN 'failed'
    WHEN _lip_sync_status IN ('done','applied')
      OR _twoshot_stage IN ('done','complete','applied') THEN 'complete'
    WHEN _lip_sync_status = 'stitching' THEN 'lipsync_muxing'
    WHEN _lip_sync_status = 'running' OR _twoshot_stage = 'lipsync' THEN 'lipsync_running'
    WHEN _twoshot_stage = 'master_clip' THEN 'audio_ready'
    WHEN _twoshot_stage = 'audio' THEN 'audio_prep'
    WHEN _clip_status IN ('ready','completed')
      AND _clip_url IS NOT NULL AND length(_clip_url) > 0 THEN 'plate_ready'
    WHEN _clip_status IN ('generating','rendering','processing') THEN 'plate_rendering'
    WHEN _clip_status IN ('queued','pending') AND _active_run_id IS NOT NULL THEN 'plate_queued'
    ELSE 'idle'
  END::public.composer_scene_state;
$$;

-- ------------------------------------------------------------
-- Brücke: Zustand -> Legacy-Spalten (BEFORE-Trigger, keine Rekursion)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.composer_scene_state_bridge()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  legacy_changed boolean;
  state_changed boolean;
  derived public.composer_scene_state;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.pipeline_state = 'idle' THEN
      NEW.pipeline_state := public.composer_state_from_legacy(
        NEW.clip_status, NEW.twoshot_stage, NEW.lip_sync_status,
        NEW.clip_url, NEW.active_run_id, NEW.audio_plan);
    END IF;
    NEW.pipeline_state_at := now();
    RETURN NEW;
  END IF;

  state_changed := NEW.pipeline_state IS DISTINCT FROM OLD.pipeline_state;
  legacy_changed :=
    NEW.clip_status     IS DISTINCT FROM OLD.clip_status
    OR NEW.twoshot_stage   IS DISTINCT FROM OLD.twoshot_stage
    OR NEW.lip_sync_status IS DISTINCT FROM OLD.lip_sync_status
    OR NEW.clip_url        IS DISTINCT FROM OLD.clip_url;

  IF state_changed THEN
    -- Neuer Pfad hat geschrieben: Legacy-Spalten nachziehen, sofern sie
    -- nicht im selben Statement explizit mitgesetzt wurden.
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

  ELSIF legacy_changed THEN
    -- Alter Pfad hat geschrieben: Zustand daraus ableiten.
    derived := public.composer_state_from_legacy(
      NEW.clip_status, NEW.twoshot_stage, NEW.lip_sync_status,
      NEW.clip_url, NEW.active_run_id, NEW.audio_plan);
    IF derived IS DISTINCT FROM NEW.pipeline_state THEN
      NEW.pipeline_state := derived;
      NEW.pipeline_state_at := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_composer_scene_state_bridge
  BEFORE INSERT OR UPDATE ON public.composer_scenes
  FOR EACH ROW EXECUTE FUNCTION public.composer_scene_state_bridge();

-- ------------------------------------------------------------
-- Backfill
-- ------------------------------------------------------------
UPDATE public.composer_scenes
SET pipeline_state = public.composer_state_from_legacy(
      clip_status, twoshot_stage, lip_sync_status, clip_url, active_run_id, audio_plan),
    pipeline_state_at = COALESCE(updated_at, now()),
    pipeline_state_run_id = active_run_id;

-- ------------------------------------------------------------
-- Atomarer Zustandswechsel
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.composer_scene_transition(
  _scene_id uuid,
  _to public.composer_scene_state,
  _from public.composer_scene_state[] DEFAULT NULL,
  _detail text DEFAULT NULL,
  _run_id uuid DEFAULT NULL,
  _generation integer DEFAULT NULL
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
      updated_at = now()
  WHERE id = _scene_id;

  RETURN QUERY SELECT true, _to, NULL::text;
END;
$$;

REVOKE ALL ON FUNCTION public.composer_scene_transition(uuid, public.composer_scene_state, public.composer_scene_state[], text, uuid, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.composer_scene_transition(uuid, public.composer_scene_state, public.composer_scene_state[], text, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.composer_scene_transition(uuid, public.composer_scene_state, public.composer_scene_state[], text, uuid, integer) TO service_role;