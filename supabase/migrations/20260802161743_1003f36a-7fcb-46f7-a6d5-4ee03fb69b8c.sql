CREATE OR REPLACE FUNCTION public.composer_scene_state_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
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

  -- Klasse C (v388): nicht freigegebener Uebergang -> ZURUECKWEISEN.
  -- Bis v388 wurde hier nur protokolliert; damit blieb der Vertrag reine
  -- Konvention. Ab jetzt wird der Wechsel auf den alten Zustand zurueck-
  -- gerollt, inklusive der gespiegelten Legacy-Spalten.
  SELECT EXISTS (
    SELECT 1 FROM public.composer_scene_transitions
    WHERE from_state = OLD.pipeline_state AND to_state = NEW.pipeline_state
  ) INTO allowed;

  IF NOT allowed THEN
    INSERT INTO public.composer_state_guard_violations
      (scene_id, from_state, to_state, verdict, reason)
    VALUES (OLD.id, OLD.pipeline_state, NEW.pipeline_state, 'blocked',
            'not_allowlisted');
    NEW.pipeline_state   := OLD.pipeline_state;
    NEW.clip_status      := OLD.clip_status;
    NEW.twoshot_stage    := OLD.twoshot_stage;
    NEW.lip_sync_status  := OLD.lip_sync_status;
    NEW.pipeline_state_at := OLD.pipeline_state_at;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$fn$;