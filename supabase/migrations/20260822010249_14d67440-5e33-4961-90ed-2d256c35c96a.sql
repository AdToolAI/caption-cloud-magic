-- v438 — Current-generation plate authority in the legacy derivation.
-- Stale twoshot_stage / lip_sync_status of a previous plate generation must
-- never advance a fresh run into audio/lip-sync phases.

DROP FUNCTION IF EXISTS public.composer_state_from_legacy(text, text, text, text, uuid, jsonb);
DROP FUNCTION IF EXISTS public.composer_substate_from_legacy(text, text, text);

CREATE OR REPLACE FUNCTION public.composer_state_from_legacy(
  _clip_status text,
  _twoshot_stage text,
  _lip_sync_status text,
  _clip_url text,
  _active_run_id uuid,
  _audio_plan jsonb,
  _plate_generation integer,
  _plate_ready_generation integer
)
RETURNS composer_scene_state
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  WITH r AS (
    SELECT (
      _clip_url IS NOT NULL AND length(_clip_url) > 0
      AND (
        _plate_generation IS NULL
        OR (_plate_ready_generation IS NOT NULL AND _plate_ready_generation = _plate_generation)
      )
    ) AS plate_ready
  )
  SELECT CASE
    WHEN _clip_status = 'canceled' OR _lip_sync_status = 'canceled' THEN 'canceled'
    WHEN _clip_status = 'failed'
      OR _twoshot_stage IN ('failed','audio_mux_failed')
      OR _lip_sync_status = 'failed' THEN 'failed'
    WHEN r.plate_ready AND (_lip_sync_status IN ('done','applied')
      OR _twoshot_stage IN ('done','complete','applied')) THEN 'complete'
    WHEN r.plate_ready AND _lip_sync_status = 'stitching' THEN 'lipsync_muxing'
    WHEN r.plate_ready AND (_lip_sync_status = 'audio_muxing' OR _twoshot_stage = 'audio_muxing') THEN 'lipsync_running'
    WHEN r.plate_ready AND (_lip_sync_status = 'running' OR _twoshot_stage = 'lipsync') THEN 'lipsync_running'
    WHEN r.plate_ready AND _twoshot_stage = 'master_clip' THEN 'audio_ready'
    WHEN r.plate_ready AND _twoshot_stage = 'audio' THEN 'audio_prep'
    WHEN r.plate_ready AND _clip_status IN ('ready','completed') THEN 'plate_ready'
    WHEN _clip_status IN ('generating','rendering','processing') THEN 'plate_rendering'
    WHEN _clip_status IN ('queued','pending') AND _active_run_id IS NOT NULL THEN 'plate_queued'
    ELSE 'idle'
  END::public.composer_scene_state
  FROM r;
$function$;

CREATE OR REPLACE FUNCTION public.composer_substate_from_legacy(
  _clip_status text,
  _twoshot_stage text,
  _lip_sync_status text,
  _clip_url text,
  _plate_generation integer,
  _plate_ready_generation integer
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  WITH r AS (
    SELECT (
      _clip_url IS NOT NULL AND length(_clip_url) > 0
      AND (
        _plate_generation IS NULL
        OR (_plate_ready_generation IS NOT NULL AND _plate_ready_generation = _plate_generation)
      )
    ) AS plate_ready,
    (
      _clip_status = 'failed'
      OR _twoshot_stage IN ('failed','audio_mux_failed')
      OR _lip_sync_status = 'failed'
    ) AS is_failed
  )
  SELECT CASE
    WHEN _clip_status = 'awaiting_manual_face_map' THEN 'awaiting_manual_face_map'
    WHEN _clip_status = 'awaiting_confirmation' AND _twoshot_stage = 'preview' THEN 'awaiting_confirmation'
    WHEN _clip_status = 'canceled' OR _lip_sync_status = 'canceled' THEN NULL
    WHEN r.is_failed AND NOT r.plate_ready THEN 'plate_failed'
    WHEN r.is_failed AND _twoshot_stage = 'audio_mux_failed' THEN 'audio_mux_failed'
    WHEN r.is_failed AND _twoshot_stage = 'failed' AND _lip_sync_status = 'failed' THEN 'lipsync_failed'
    WHEN r.is_failed THEN NULL
    WHEN _twoshot_stage LIKE 'syncso_pass_%' THEN _twoshot_stage
    WHEN _twoshot_stage LIKE 'syncso_fanout_%' THEN _twoshot_stage
    WHEN _twoshot_stage LIKE 'syncso_retry_%' THEN _twoshot_stage
    WHEN _twoshot_stage = 'circuit_open' THEN 'circuit_open'
    WHEN _twoshot_stage = 'deferred' THEN 'deferred'
    WHEN _twoshot_stage = 'needs_clip_rerender' THEN 'needs_clip_rerender'
    WHEN _twoshot_stage = 'anchor' THEN 'anchor'
    WHEN _twoshot_stage = 'anchor_soft_pass' THEN 'anchor_soft_pass'
    WHEN _twoshot_stage = 'preview' THEN 'preview'
    ELSE NULL
  END
  FROM r;
$function$;

CREATE OR REPLACE FUNCTION public.composer_scene_state_bridge()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  legacy_changed boolean;
  state_changed boolean;
  substate_changed boolean;
  derived public.composer_scene_state;
  derived_substate text;
  legacy_audio_mux boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.pipeline_state = 'idle' THEN
      NEW.pipeline_state := public.composer_state_from_legacy(
        NEW.clip_status, NEW.twoshot_stage, NEW.lip_sync_status,
        NEW.clip_url, NEW.active_run_id, NEW.audio_plan,
        NEW.plate_generation, NEW.plate_ready_generation);
    END IF;
    NEW.pipeline_substate := COALESCE(
      NEW.pipeline_substate,
      public.composer_substate_from_legacy(
        NEW.clip_status, NEW.twoshot_stage, NEW.lip_sync_status,
        NEW.clip_url, NEW.plate_generation, NEW.plate_ready_generation)
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
    OR NEW.clip_url        IS DISTINCT FROM OLD.clip_url
    OR NEW.plate_generation IS DISTINCT FROM OLD.plate_generation
    OR NEW.plate_ready_generation IS DISTINCT FROM OLD.plate_ready_generation;
  substate_changed := NEW.pipeline_substate IS DISTINCT FROM OLD.pipeline_substate;

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
    IF NEW.pipeline_substate IS NULL THEN
      NEW.pipeline_substate_at := now();
    END IF;

  ELSIF legacy_changed OR (NEW.clip_url IS DISTINCT FROM OLD.clip_url) THEN
    derived := public.composer_state_from_legacy(
      NEW.clip_status, NEW.twoshot_stage, NEW.lip_sync_status,
      NEW.clip_url, NEW.active_run_id, NEW.audio_plan,
      NEW.plate_generation, NEW.plate_ready_generation);

    legacy_audio_mux := (NEW.lip_sync_status = 'audio_muxing' OR NEW.twoshot_stage = 'audio_muxing');
    IF legacy_audio_mux
       AND NEW.pipeline_state IN ('lipsync_muxing'::public.composer_scene_state,
                                  'complete'::public.composer_scene_state) THEN
      derived := NEW.pipeline_state;
    END IF;

    IF derived IS DISTINCT FROM NEW.pipeline_state THEN
      NEW.pipeline_state := derived;
      NEW.pipeline_state_at := now();
    END IF;

    derived_substate := public.composer_substate_from_legacy(
      NEW.clip_status, NEW.twoshot_stage, NEW.lip_sync_status,
      NEW.clip_url, NEW.plate_generation, NEW.plate_ready_generation);
    IF derived_substate IS DISTINCT FROM NEW.pipeline_substate THEN
      NEW.pipeline_substate := derived_substate;
      NEW.pipeline_substate_at := now();
    END IF;
  END IF;

  IF substate_changed AND NEW.pipeline_substate IS NOT NULL THEN
    NEW.pipeline_substate_at := now();
  END IF;

  RETURN NEW;
END;
$function$;