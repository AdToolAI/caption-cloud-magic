CREATE OR REPLACE FUNCTION public.stamp_plate_generation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.clip_url IS DISTINCT FROM OLD.clip_url THEN
    IF NEW.clip_url IS NULL OR length(NEW.clip_url) = 0 THEN
      NEW.plate_ready_generation := NULL;
      NEW.plate_ready_at := NULL;
    ELSE
      NEW.plate_ready_generation := NEW.plate_generation;
      NEW.plate_ready_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS composer_scenes_stamp_plate_generation ON public.composer_scenes;
CREATE TRIGGER composer_scenes_stamp_plate_generation
  BEFORE UPDATE ON public.composer_scenes
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_plate_generation();