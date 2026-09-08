CREATE OR REPLACE FUNCTION public.video_enhance_monotonic_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  terminal text[] := ARRAY['completed','provider_failed','output_lost','provider_cancelled_confirmed'];
BEGIN
  -- A terminal run is final. Late webhook, poll or reconcile answers may still
  -- write bookkeeping columns, but they can never revive the run.
  IF OLD.status = ANY(terminal) AND NEW.status <> OLD.status THEN
    NEW.status := OLD.status;
    NEW.next_persist_at := NULL;
    NEW.next_provider_poll_at := NULL;
    NEW.persist_lease_until := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_video_enhance_monotonic_status ON public.video_enhance_runs;
CREATE TRIGGER trg_video_enhance_monotonic_status
BEFORE UPDATE ON public.video_enhance_runs
FOR EACH ROW
EXECUTE FUNCTION public.video_enhance_monotonic_status();