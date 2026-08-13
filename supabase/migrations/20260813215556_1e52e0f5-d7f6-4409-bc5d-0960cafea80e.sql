-- v430 Schritt 4 — Continuity-Kette: Staleness, Finalitäts-Guard, Run-Snapshot

ALTER TABLE public.composer_scenes
  ADD COLUMN IF NOT EXISTS first_rendered_at timestamptz,
  ADD COLUMN IF NOT EXISTS continuity_source_clip_url text,
  ADD COLUMN IF NOT EXISTS continuity_rendered_source_clip_url text,
  ADD COLUMN IF NOT EXISTS continuity_stale boolean NOT NULL DEFAULT false;

ALTER TABLE public.plate_attempts
  ADD COLUMN IF NOT EXISTS continuity_source_clip_url text;

ALTER TABLE public.composer_scene_runs
  ADD COLUMN IF NOT EXISTS continuity_source_clip_url text;

-- ---------------------------------------------------------------------------
-- Lesefunktionen: SQL-Spiegel von isLipSyncIntentionalRow() / isSceneOutputFinal()
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.scene_lipsync_intentional(
  _lip_sync_with_voiceover boolean,
  _dialog_mode boolean,
  _engine_override text
) RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(_lip_sync_with_voiceover, false)
      OR COALESCE(_dialog_mode, false)
      OR COALESCE(_engine_override, '') IN ('cinematic-sync','sync-segments','native-dialogue')
$$;

CREATE OR REPLACE FUNCTION public.scene_output_is_final(
  _lip_sync_with_voiceover boolean,
  _dialog_mode boolean,
  _engine_override text,
  _clip_url text,
  _processed_video_url text
) RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.scene_lipsync_intentional(_lip_sync_with_voiceover, _dialog_mode, _engine_override)
      THEN _processed_video_url IS NOT NULL
    ELSE _clip_url IS NOT NULL
  END
$$;

-- ---------------------------------------------------------------------------
-- first_rendered_at — einmalig, reset-fest
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.stamp_first_rendered_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.clip_url IS NOT NULL AND NEW.first_rendered_at IS NULL THEN
    NEW.first_rendered_at := COALESCE(OLD.first_rendered_at, now());
  ELSE
    NEW.first_rendered_at := COALESCE(NEW.first_rendered_at, OLD.first_rendered_at);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_first_rendered_at ON public.composer_scenes;
CREATE TRIGGER trg_stamp_first_rendered_at
BEFORE UPDATE ON public.composer_scenes
FOR EACH ROW EXECUTE FUNCTION public.stamp_first_rendered_at();

-- ---------------------------------------------------------------------------
-- Staleness-Propagation — wertbasiert, nicht sticky
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.propagate_continuity_staleness(
  _scene_id uuid,
  _effective_url text
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.composer_scenes b
     SET continuity_stale = (b.continuity_source_clip_url IS DISTINCT FROM _effective_url)
   WHERE b.continuity_source_scene_id = _scene_id
     AND b.continuity_source_clip_url IS NOT NULL
     AND b.continuity_stale IS DISTINCT FROM (b.continuity_source_clip_url IS DISTINCT FROM _effective_url);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.propagate_continuity_staleness(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.propagate_continuity_staleness(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.trg_propagate_continuity_staleness()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_effective text;
BEGIN
  v_effective := COALESCE(NEW.processed_video_url, NEW.base_video_url, NEW.clip_url);
  PERFORM public.propagate_continuity_staleness(NEW.id, v_effective);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_continuity_staleness ON public.composer_scenes;
CREATE TRIGGER trg_continuity_staleness
AFTER UPDATE OF clip_url ON public.composer_scenes
FOR EACH ROW
WHEN (
  NEW.clip_url IS NOT NULL
  AND NEW.clip_url IS DISTINCT FROM OLD.clip_url
  AND public.scene_output_is_final(
        NEW.lip_sync_with_voiceover, NEW.dialog_mode, NEW.engine_override,
        NEW.clip_url, NEW.processed_video_url)
)
EXECUTE FUNCTION public.trg_propagate_continuity_staleness();

-- ---------------------------------------------------------------------------
-- Run-Snapshot: plate_attempts erbt die beim Dispatch gültige Continuity-Quelle
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_plate_attempt()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_open_exists boolean;
  v_status text;
BEGIN
  IF NEW.replicate_prediction_id IS DISTINCT FROM OLD.replicate_prediction_id
     AND NEW.replicate_prediction_id IS NOT NULL
     AND length(NEW.replicate_prediction_id) > 0 THEN

    SELECT EXISTS (
      SELECT 1 FROM public.plate_attempts
       WHERE scene_id = NEW.id AND status = 'rendering'
    ) INTO v_open_exists;

    v_status := CASE WHEN v_open_exists THEN 'duplicate' ELSE 'rendering' END;

    INSERT INTO public.plate_attempts (
      scene_id, expected_plate_generation, run_id, provider, provider_job_id, status,
      continuity_source_clip_url
    )
    VALUES (
      NEW.id,
      COALESCE(NEW.plate_generation, 1),
      NEW.active_run_id,
      NEW.clip_source,
      NEW.replicate_prediction_id,
      v_status,
      NEW.continuity_source_clip_url
    )
    ON CONFLICT (scene_id, provider_job_id) WHERE provider_job_id IS NOT NULL
    DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Freeze-Guard: der Run-Contract-Spiegel darf nach dem Freeze nicht mehr wandern
CREATE OR REPLACE FUNCTION public.guard_run_continuity_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.contract_frozen_at IS NOT NULL
     AND NEW.continuity_source_clip_url IS DISTINCT FROM OLD.continuity_source_clip_url THEN
    RAISE EXCEPTION 'continuity_source_clip_url is frozen for run %', OLD.run_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_run_continuity_snapshot ON public.composer_scene_runs;
CREATE TRIGGER trg_guard_run_continuity_snapshot
BEFORE UPDATE ON public.composer_scene_runs
FOR EACH ROW EXECUTE FUNCTION public.guard_run_continuity_snapshot();

-- ---------------------------------------------------------------------------
-- Backfill
-- ---------------------------------------------------------------------------
UPDATE public.composer_scenes s
   SET first_rendered_at = COALESCE(s.plate_ready_at, s.updated_at)
 WHERE s.first_rendered_at IS NULL
   AND (
     s.clip_url IS NOT NULL
     OR s.base_video_url IS NOT NULL
     OR s.processed_video_url IS NOT NULL
     OR EXISTS (
       SELECT 1 FROM public.plate_attempts a
        WHERE a.scene_id = s.id AND a.status = 'completed'
     )
   );

-- Legacy-Backfill: bereits gerenderte Szenen mit gesetzter Quelle gelten als
-- "mit dieser Quelle gerendert", damit die Migration allein niemanden dirty macht.
UPDATE public.composer_scenes s
   SET continuity_rendered_source_clip_url = s.continuity_source_clip_url
 WHERE s.continuity_rendered_source_clip_url IS NULL
   AND s.continuity_source_clip_url IS NOT NULL
   AND s.first_rendered_at IS NOT NULL;