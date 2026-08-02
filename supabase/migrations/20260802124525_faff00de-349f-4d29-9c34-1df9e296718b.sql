-- v377 — Single-Run contract for composer scene generation.

-- 1. Scene carries the id of the run that is currently allowed to write.
ALTER TABLE public.composer_scenes
  ADD COLUMN IF NOT EXISTS active_run_id uuid,
  ADD COLUMN IF NOT EXISTS active_run_started_at timestamptz;

-- 2. Every plate attempt is bound to the run it was dispatched under.
ALTER TABLE public.plate_attempts
  ADD COLUMN IF NOT EXISTS run_id uuid;

ALTER TABLE public.plate_attempts DROP CONSTRAINT IF EXISTS plate_attempts_status_chk;
ALTER TABLE public.plate_attempts
  ADD CONSTRAINT plate_attempts_status_chk
  CHECK (status IN ('rendering','completed','failed','superseded','duplicate'));

-- 3. Heal existing data: keep only the newest open attempt per scene so the
--    one-open-attempt invariant can be enforced by an index from now on.
UPDATE public.plate_attempts a
   SET status = 'superseded',
       superseded_at = now()
 WHERE a.status = 'rendering'
   AND a.id <> (
     SELECT b.id FROM public.plate_attempts b
      WHERE b.scene_id = a.scene_id AND b.status = 'rendering'
      ORDER BY b.created_at DESC, b.id DESC
      LIMIT 1
   );

CREATE UNIQUE INDEX IF NOT EXISTS plate_attempts_one_open_per_scene_uidx
  ON public.plate_attempts (scene_id)
  WHERE status = 'rendering';

CREATE INDEX IF NOT EXISTS plate_attempts_run_idx
  ON public.plate_attempts (scene_id, run_id);

-- 4. Registration stamps the run id and never creates a second open attempt.
--    A duplicate dispatch is recorded as 'duplicate' (visible forensics)
--    instead of raising, so the dispatcher write itself cannot crash.
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
      scene_id, expected_plate_generation, run_id, provider, provider_job_id, status
    )
    VALUES (
      NEW.id,
      COALESCE(NEW.plate_generation, 1),
      NEW.active_run_id,
      NEW.clip_source,
      NEW.replicate_prediction_id,
      v_status
    )
    ON CONFLICT (scene_id, provider_job_id) WHERE provider_job_id IS NOT NULL
    DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- 5. Atomic, exclusive start of a scene run. This is the only supported way to
--    begin a paid render: it locks the row, bumps the generation (which
--    tombstones open attempts via the existing supersede trigger) and mints a
--    fresh run id in the same transaction.
CREATE OR REPLACE FUNCTION public.composer_start_scene_run(_scene_id uuid)
RETURNS TABLE(generation integer, run_id uuid, project_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gen integer;
  v_run uuid;
  v_proj uuid;
BEGIN
  SELECT s.plate_generation, s.project_id
    INTO v_gen, v_proj
    FROM public.composer_scenes s
   WHERE s.id = _scene_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'scene_not_found';
  END IF;

  v_gen := COALESCE(v_gen, 1) + 1;
  v_run := gen_random_uuid();

  UPDATE public.composer_scenes
     SET plate_generation = v_gen,
         plate_generation_started_at = now(),
         plate_ready_generation = NULL,
         plate_ready_at = NULL,
         active_run_id = v_run,
         active_run_started_at = now(),
         updated_at = now()
   WHERE id = _scene_id;

  RETURN QUERY SELECT v_gen, v_run, v_proj;
END;
$$;

REVOKE ALL ON FUNCTION public.composer_start_scene_run(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.composer_start_scene_run(uuid) TO service_role;