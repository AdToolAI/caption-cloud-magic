CREATE OR REPLACE FUNCTION public.composer_scene_state_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  allowed boolean;
BEGIN
  IF NEW.pipeline_state IS NOT DISTINCT FROM OLD.pipeline_state THEN
    RETURN NEW;
  END IF;

  IF coalesce(current_setting('composer.transition_scene', true), '') = OLD.id::text THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.composer_scene_transitions
    WHERE from_state = OLD.pipeline_state
      AND to_state = NEW.pipeline_state
  ) INTO allowed;

  IF NOT allowed THEN
    INSERT INTO public.composer_state_guard_violations
      (scene_id, from_state, to_state, verdict, reason)
    VALUES
      (OLD.id, OLD.pipeline_state, NEW.pipeline_state, 'observed',
       'v400_july_baseline_observe_only');
  END IF;

  RETURN NEW;
END;
$function$;