CREATE OR REPLACE FUNCTION public.ensure_trial_contract()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.trial_status IS NULL THEN
    NEW.trial_status := 'active';
  END IF;
  IF NEW.trial_started_at IS NULL THEN
    NEW.trial_started_at := now();
  END IF;
  IF NEW.trial_ends_at IS NULL AND NEW.trial_status IN ('active', 'grace') THEN
    NEW.trial_ends_at := COALESCE(NEW.trial_started_at, now()) + INTERVAL '14 days';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_trial_contract ON public.profiles;
CREATE TRIGGER trg_ensure_trial_contract
BEFORE INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.ensure_trial_contract();