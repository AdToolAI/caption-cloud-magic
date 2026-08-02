-- v375 — immutable plate generation per provider dispatch
CREATE TABLE IF NOT EXISTS public.plate_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id uuid NOT NULL REFERENCES public.composer_scenes(id) ON DELETE CASCADE,
  expected_plate_generation integer NOT NULL,
  provider text,
  provider_job_id text,
  status text NOT NULL DEFAULT 'rendering',
  clip_url text,
  superseded_by_generation integer,
  superseded_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plate_attempts_status_chk
    CHECK (status IN ('rendering','completed','failed','superseded'))
);

GRANT SELECT ON public.plate_attempts TO authenticated;
GRANT ALL ON public.plate_attempts TO service_role;

ALTER TABLE public.plate_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view plate attempts of their own scenes"
ON public.plate_attempts
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.composer_scenes s
    JOIN public.composer_projects p ON p.id = s.project_id
    WHERE s.id = plate_attempts.scene_id
      AND p.user_id = auth.uid()
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS plate_attempts_scene_job_uidx
  ON public.plate_attempts (scene_id, provider_job_id)
  WHERE provider_job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS plate_attempts_scene_status_idx
  ON public.plate_attempts (scene_id, status);

CREATE TRIGGER plate_attempts_set_updated_at
  BEFORE UPDATE ON public.plate_attempts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Register an attempt at dispatch time, stamped with the generation that is
-- current *at dispatch*. This is the single choke point every provider route
-- passes through (replicate_prediction_id is written for HappyHorse, Hailuo,
-- Kling and Luma alike).
CREATE OR REPLACE FUNCTION public.register_plate_attempt()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.replicate_prediction_id IS DISTINCT FROM OLD.replicate_prediction_id
     AND NEW.replicate_prediction_id IS NOT NULL
     AND length(NEW.replicate_prediction_id) > 0 THEN
    INSERT INTO public.plate_attempts (
      scene_id, expected_plate_generation, provider, provider_job_id, status
    )
    VALUES (
      NEW.id,
      COALESCE(NEW.plate_generation, 1),
      NEW.clip_source,
      NEW.replicate_prediction_id,
      'rendering'
    )
    ON CONFLICT (scene_id, provider_job_id) WHERE provider_job_id IS NOT NULL
    DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS composer_scenes_register_plate_attempt ON public.composer_scenes;
CREATE TRIGGER composer_scenes_register_plate_attempt
  AFTER UPDATE ON public.composer_scenes
  FOR EACH ROW
  EXECUTE FUNCTION public.register_plate_attempt();

-- v376 — a generation bump logically invalidates every open attempt BEFORE any
-- physical cleanup runs. Tombstone instead of delete so late webhooks keep
-- their reference.
CREATE OR REPLACE FUNCTION public.supersede_plate_attempts()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.plate_generation, 1) > COALESCE(OLD.plate_generation, 1) THEN
    UPDATE public.plate_attempts
       SET status = 'superseded',
           superseded_at = now(),
           superseded_by_generation = COALESCE(NEW.plate_generation, 1)
     WHERE scene_id = NEW.id
       AND status = 'rendering';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS composer_scenes_supersede_plate_attempts ON public.composer_scenes;
CREATE TRIGGER composer_scenes_supersede_plate_attempts
  AFTER UPDATE OF plate_generation ON public.composer_scenes
  FOR EACH ROW
  EXECUTE FUNCTION public.supersede_plate_attempts();