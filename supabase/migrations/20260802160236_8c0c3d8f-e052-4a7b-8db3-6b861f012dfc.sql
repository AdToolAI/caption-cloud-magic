-- ============================================================
-- v388 — Zustandswächter: ein einziger, physisch erzwungener Schreibweg
-- ============================================================

-- 1) Legitime Selbstheilungs-Kanten in die Freigabeliste aufnehmen ---------
INSERT INTO public.composer_scene_transitions (from_state, to_state)
SELECT s, 'idle'::public.composer_scene_state
FROM unnest(ARRAY[
  'idle','plate_queued','plate_rendering','plate_ready','audio_prep',
  'audio_ready','lipsync_dispatched','lipsync_running','lipsync_muxing'
]::public.composer_scene_state[]) s
ON CONFLICT DO NOTHING;

INSERT INTO public.composer_scene_transitions (from_state, to_state) VALUES
  -- Audio-Plan war noch nicht fertig -> zurueck auf fertige Plate
  ('audio_prep','plate_ready'),
  ('audio_ready','plate_ready'),
  ('lipsync_dispatched','plate_ready'),
  ('lipsync_running','plate_ready'),
  -- Backoff (Circuit offen, Slot belegt, Face-Detect-Retry) -> wieder bereit
  ('lipsync_dispatched','audio_ready'),
  ('lipsync_running','audio_ready'),
  ('lipsync_muxing','lipsync_running'),
  -- Idempotente Wiederholungen desselben Zustands
  ('idle','idle'),
  ('plate_queued','plate_queued'),
  ('plate_ready','plate_ready'),
  ('audio_ready','audio_ready'),
  ('lipsync_muxing','lipsync_muxing'),
  ('complete','complete'),
  ('failed','failed'),
  ('canceled','canceled'),
  -- Neustart einer fertigen/abgebrochenen Szene laeuft ueber plate_queued,
  -- ein direkter Re-Render aus plate_ready ist ebenfalls zulaessig
  ('plate_ready','plate_queued'),
  ('plate_ready','plate_rendering'),
  ('idle','plate_rendering')
ON CONFLICT DO NOTHING;

-- 2) Protokoll fuer abgewiesene Zustandssspruenge --------------------------
CREATE TABLE IF NOT EXISTS public.composer_state_guard_violations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id uuid NOT NULL,
  from_state public.composer_scene_state NOT NULL,
  to_state public.composer_scene_state NOT NULL,
  verdict text NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.composer_state_guard_violations TO service_role;
ALTER TABLE public.composer_state_guard_violations ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_state_guard_violations_scene
  ON public.composer_state_guard_violations (scene_id, created_at DESC);

-- 3) Der Waechter ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.composer_scene_state_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  marker text;
  allowed boolean;
BEGIN
  IF NEW.pipeline_state IS NOT DISTINCT FROM OLD.pipeline_state THEN
    RETURN NEW;
  END IF;

  -- Der geprüfte Weg (composer_scene_transition) setzt diese Markierung
  -- innerhalb seiner Transaktion und hat bereits validiert.
  marker := coalesce(current_setting('composer.transition_scene', true), '');
  IF marker = OLD.id::text THEN
    RETURN NEW;
  END IF;

  -- Klasse A: Wiederbelebung einer terminalen Szene.
  IF OLD.pipeline_state IN ('failed','canceled')
     AND NEW.pipeline_state NOT IN ('idle','plate_queued','failed','canceled') THEN
    INSERT INTO public.composer_state_guard_violations
      (scene_id, from_state, to_state, verdict, reason)
    VALUES (OLD.id, OLD.pipeline_state, NEW.pipeline_state, 'blocked',
            'terminal_revive_blocked');
    NEW.pipeline_state   := OLD.pipeline_state;
    NEW.clip_status      := OLD.clip_status;
    NEW.twoshot_stage    := OLD.twoshot_stage;
    NEW.lip_sync_status  := OLD.lip_sync_status;
    NEW.pipeline_state_at := OLD.pipeline_state_at;
    RETURN NEW;
  END IF;

  -- Klasse B: Sprung in Ton-/Lip-Sync-Phase ohne realisierte Plate.
  IF NEW.pipeline_state IN
       ('audio_prep','audio_ready','lipsync_dispatched','lipsync_running','lipsync_muxing','complete')
     AND OLD.pipeline_state IN ('idle','plate_queued','plate_rendering') THEN
    INSERT INTO public.composer_state_guard_violations
      (scene_id, from_state, to_state, verdict, reason)
    VALUES (OLD.id, OLD.pipeline_state, NEW.pipeline_state, 'blocked',
            'phase_jump_without_plate');
    NEW.pipeline_state   := OLD.pipeline_state;
    NEW.clip_status      := OLD.clip_status;
    NEW.twoshot_stage    := OLD.twoshot_stage;
    NEW.lip_sync_status  := OLD.lip_sync_status;
    NEW.pipeline_state_at := OLD.pipeline_state_at;
    RETURN NEW;
  END IF;

  -- Klasse C: nicht freigegebener Uebergang -> protokollieren.
  SELECT EXISTS (
    SELECT 1 FROM public.composer_scene_transitions
    WHERE from_state = OLD.pipeline_state AND to_state = NEW.pipeline_state
  ) INTO allowed;

  IF NOT allowed THEN
    INSERT INTO public.composer_state_guard_violations
      (scene_id, from_state, to_state, verdict, reason)
    VALUES (OLD.id, OLD.pipeline_state, NEW.pipeline_state, 'logged',
            'not_allowlisted');
  END IF;

  RETURN NEW;
END;
$$;

-- Name sortiert nach dem Bridge-Trigger -> laeuft danach und sieht den
-- endgueltigen NEW.pipeline_state.
DROP TRIGGER IF EXISTS trg_composer_scene_zguard ON public.composer_scenes;
CREATE TRIGGER trg_composer_scene_zguard
  BEFORE UPDATE ON public.composer_scenes
  FOR EACH ROW EXECUTE FUNCTION public.composer_scene_state_guard();

-- 4) Der geprüfte Weg markiert sich selbst -------------------------------
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

  SELECT EXISTS (
    SELECT 1 FROM public.composer_scene_transitions
    WHERE from_state = cur.pipeline_state AND to_state = _to
  ) INTO allowed;

  IF NOT allowed THEN
    RAISE LOG 'v388_forbidden_transition scene=% from=% to=%', _scene_id, cur.pipeline_state, _to;
    RETURN QUERY SELECT false, cur.pipeline_state, 'transition_not_allowed';
    RETURN;
  END IF;

  PERFORM set_config('composer.transition_scene', _scene_id::text, true);

  UPDATE public.composer_scenes
  SET pipeline_state = _to,
      pipeline_detail = COALESCE(_detail, pipeline_detail),
      pipeline_state_run_id = COALESCE(_run_id, active_run_id),
      updated_at = now()
  WHERE id = _scene_id;

  PERFORM set_config('composer.transition_scene', '', true);

  RETURN QUERY SELECT true, _to, NULL::text;
END;
$$;

REVOKE ALL ON FUNCTION public.composer_scene_transition(uuid, public.composer_scene_state, public.composer_scene_state[], text, uuid, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.composer_scene_transition(uuid, public.composer_scene_state, public.composer_scene_state[], text, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.composer_scene_transition(uuid, public.composer_scene_state, public.composer_scene_state[], text, uuid, integer) TO service_role;