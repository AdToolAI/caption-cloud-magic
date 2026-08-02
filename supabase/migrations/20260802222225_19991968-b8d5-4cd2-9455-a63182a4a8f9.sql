-- v398: Rollback-Kompatibilität für die 27.07.2026-Lip-Sync-Kette
-- Bridge: Legacy-Writes dürfen wieder in Audio-/Lip-Sync-Phasen spiegeln.
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
    OR NEW.lip_sync_status IS DISTINCT FROM OLD.lip_sync_status;

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

  ELSIF legacy_changed OR (NEW.clip_url IS DISTINCT FROM OLD.clip_url) THEN
    derived := public.composer_state_from_legacy(
      NEW.clip_status, NEW.twoshot_stage, NEW.lip_sync_status,
      NEW.clip_url, NEW.active_run_id, NEW.audio_plan);

    -- v398: Die zurückgebaute Lip-Sync-Kette steuert wieder über die
    -- Legacy-Spalten. Der v387-Block (Legacy darf nicht in Audio-/Lip-Sync-
    -- Phasen heben) wird deshalb aufgehoben, sonst bleibt die Szene bei
    -- "Lip-Sync wird gestartet" stehen.
    IF derived IS DISTINCT FROM NEW.pipeline_state THEN
      NEW.pipeline_state := derived;
      NEW.pipeline_state_at := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Guard: nur noch beobachten/protokollieren statt zurückrollen.
-- Klasse A (Wiederbelebung terminaler Szenen) bleibt hart blockiert.
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

  marker := coalesce(current_setting('composer.transition_scene', true), '');
  IF marker = OLD.id::text THEN
    RETURN NEW;
  END IF;

  -- Klasse A: Wiederbelebung einer terminalen Szene -> weiterhin blockiert.
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

  -- Klasse B/C: ab v398 nur noch Telemetrie (kein Rollback), damit die
  -- zurückgebaute Kette ihre eigenen Übergänge fahren darf.
  SELECT EXISTS (
    SELECT 1 FROM public.composer_scene_transitions
    WHERE from_state = OLD.pipeline_state AND to_state = NEW.pipeline_state
  ) INTO allowed;

  IF NOT allowed THEN
    INSERT INTO public.composer_state_guard_violations
      (scene_id, from_state, to_state, verdict, reason)
    VALUES (OLD.id, OLD.pipeline_state, NEW.pipeline_state, 'observed',
            'v398_rollback_observe_only');
  END IF;

  RETURN NEW;
END;
$$;