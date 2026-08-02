CREATE OR REPLACE FUNCTION public.composer_scene_state_bridge()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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

    -- v387: Legacy-Spalten sind Spiegel, keine Steuerung. Ein reiner
    -- Legacy-Write darf die Szene NIE in eine Audio-/Lip-Sync-Phase heben --
    -- genau so sprang eine Szene in den Lip-Sync, waehrend die Plate noch
    -- gerendert wurde. Diese Phasen setzt ausschliesslich
    -- composer_scene_transition(). Frueh-Phasen sowie failed/canceled
    -- duerfen weiterhin gespiegelt werden.
    IF derived IN ('audio_prep','audio_ready','lipsync_dispatched','lipsync_running','lipsync_muxing')
       AND NEW.pipeline_state NOT IN ('audio_prep','audio_ready','lipsync_dispatched','lipsync_running','lipsync_muxing','complete')
    THEN
      RETURN NEW;
    END IF;

    IF derived IS DISTINCT FROM NEW.pipeline_state THEN
      NEW.pipeline_state := derived;
      NEW.pipeline_state_at := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;