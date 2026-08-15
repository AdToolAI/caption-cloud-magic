-- v431 G3.1d — Drain-Hardening: Reaper-Scheduler + persistente Observe-Telemetrie

-- =====================================================================
-- B) Reaper real planen (pg_cron) inkl. Heartbeat aus DEMSELBEN Lauf
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

ALTER TABLE public.cron_heartbeats
  ADD COLUMN IF NOT EXISTS last_details jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.composer_reap_cron_tick(p_older_than_minutes integer DEFAULT 10)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_started_at timestamptz := clock_timestamp();
  v_count integer;
  v_ok boolean := true;
  v_error_code text := NULL;
  v_error_msg text := NULL;
  v_details jsonb;
BEGIN
  BEGIN
    v_count := public.composer_reap_orphaned_dispatches(GREATEST(COALESCE(p_older_than_minutes, 10), 1));
  EXCEPTION WHEN OTHERS THEN
    v_ok := false;
    v_count := NULL;
    v_error_code := SQLSTATE;
    v_error_msg := SQLERRM;
  END;

  -- reaped_count wird ausschliesslich bei erfolgreichem Reaper-Aufruf geschrieben.
  v_details := jsonb_build_object(
    'ran_at', to_jsonb(v_started_at),
    'threshold_minutes', GREATEST(COALESCE(p_older_than_minutes, 10), 1),
    'ok', v_ok
  );
  IF v_ok THEN
    v_details := v_details || jsonb_build_object('reaped_count', v_count);
  ELSE
    v_details := v_details || jsonb_build_object('error_code', v_error_code, 'error', v_error_msg);
  END IF;

  INSERT INTO public.cron_heartbeats AS h (
    job_name, last_run_at, last_status, last_error, last_duration_ms,
    expected_interval_seconds, consecutive_failures, updated_at, last_details
  ) VALUES (
    'composer-reap-orphaned-dispatches',
    v_started_at,
    CASE WHEN v_ok THEN 'ok' ELSE 'error' END,
    v_error_msg,
    (EXTRACT(EPOCH FROM (clock_timestamp() - v_started_at)) * 1000)::integer,
    60,
    CASE WHEN v_ok THEN 0 ELSE 1 END,
    now(),
    v_details
  )
  ON CONFLICT (job_name) DO UPDATE SET
    last_run_at = EXCLUDED.last_run_at,
    last_status = EXCLUDED.last_status,
    last_error = EXCLUDED.last_error,
    last_duration_ms = EXCLUDED.last_duration_ms,
    expected_interval_seconds = EXCLUDED.expected_interval_seconds,
    consecutive_failures = CASE WHEN v_ok THEN 0 ELSE h.consecutive_failures + 1 END,
    updated_at = now(),
    last_details = EXCLUDED.last_details;
END;
$function$;

COMMENT ON FUNCTION public.composer_reap_cron_tick(integer)
  IS 'v431 G3.1d: einziger Cron-Einstieg. Ruft den Reaper und schreibt den Heartbeat im selben Lauf; reaped_count nur bei Erfolg, sonst ok=false + error_code.';

REVOKE ALL ON FUNCTION public.composer_reap_cron_tick(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.composer_reap_cron_tick(integer) TO service_role;

-- Idempotente Registrierung des Cron-Jobs (laeuft unter der registrierenden DB-Owner-Rolle).
DO $$
BEGIN
  PERFORM cron.unschedule('composer-reap-orphaned-dispatches')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'composer-reap-orphaned-dispatches');

  PERFORM cron.schedule(
    'composer-reap-orphaned-dispatches',
    '* * * * *',
    $cron$SELECT public.composer_reap_cron_tick(10);$cron$
  );
END $$;

-- =====================================================================
-- C) Persistente append-only Observe-Telemetrie (isoliert, fail-open)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.composer_callback_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  observed_at timestamptz NOT NULL DEFAULT now(),
  handler text NOT NULL,
  stage text,
  verdict text NOT NULL,
  pipeline_job_id uuid,
  scene_id uuid,
  run_id uuid,
  plate_generation integer,
  external_job_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_composer_callback_observations_time
  ON public.composer_callback_observations (observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_composer_callback_observations_job
  ON public.composer_callback_observations (pipeline_job_id, observed_at DESC);

COMMENT ON TABLE public.composer_callback_observations
  IS 'v431 G3.1d: rein diagnostische, append-only Observe-Telemetrie. Keine Orchestrierungsdaten, keine FKs, keine direkten Writes (auch nicht service_role) - Schreiben nur ueber composer_record_callback_observation.';

-- Harte Isolation: KEINE direkten Table-Rechte, auch nicht fuer service_role.
REVOKE ALL ON TABLE public.composer_callback_observations FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.composer_callback_observations ENABLE ROW LEVEL SECURITY;
-- Bewusst keine Policies: kein Client-/API-Zugriff.

-- Append-only als echte DB-Invariante (unabhaengig von Rolle/RLS/Grants).
CREATE OR REPLACE FUNCTION public.composer_callback_observations_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
  RAISE EXCEPTION 'composer_callback_observations is append-only (% not allowed)', TG_OP
    USING ERRCODE = '42501';
END;
$function$;

DROP TRIGGER IF EXISTS trg_composer_callback_observations_append_only
  ON public.composer_callback_observations;
CREATE TRIGGER trg_composer_callback_observations_append_only
  BEFORE UPDATE OR DELETE ON public.composer_callback_observations
  FOR EACH ROW EXECUTE FUNCTION public.composer_callback_observations_append_only();

CREATE OR REPLACE FUNCTION public.composer_record_callback_observation(
  p_handler text,
  p_verdict text,
  p_stage text DEFAULT NULL,
  p_pipeline_job_id uuid DEFAULT NULL,
  p_scene_id uuid DEFAULT NULL,
  p_run_id uuid DEFAULT NULL,
  p_plate_generation integer DEFAULT NULL,
  p_external_job_id text DEFAULT NULL,
  p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.composer_callback_observations (
    handler, verdict, stage, pipeline_job_id, scene_id, run_id,
    plate_generation, external_job_id, details
  ) VALUES (
    left(COALESCE(p_handler, 'unknown'), 120),
    left(COALESCE(p_verdict, 'unknown'), 60),
    left(p_stage, 60),
    p_pipeline_job_id,
    p_scene_id,
    p_run_id,
    p_plate_generation,
    left(p_external_job_id, 200),
    COALESCE(p_details, '{}'::jsonb)
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

COMMENT ON FUNCTION public.composer_record_callback_observation(text, text, text, uuid, uuid, uuid, integer, text, jsonb)
  IS 'v431 G3.1d: einziger Schreibpfad in composer_callback_observations. Diagnostisch, append-only, fail-open beim Caller.';

REVOKE ALL ON FUNCTION public.composer_record_callback_observation(text, text, text, uuid, uuid, uuid, integer, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.composer_record_callback_observation(text, text, text, uuid, uuid, uuid, integer, text, jsonb)
  TO service_role;

DO $$
DECLARE r text;
BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'sandbox_exec%' LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.composer_record_callback_observation(text, text, text, uuid, uuid, uuid, integer, text, jsonb) TO %I', r);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.composer_reap_cron_tick(integer) TO %I', r);
  END LOOP;
END $$;