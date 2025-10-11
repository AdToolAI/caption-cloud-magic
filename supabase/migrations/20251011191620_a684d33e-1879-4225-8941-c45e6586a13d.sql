-- Fix security warning for compute_engagement_rate function
DROP FUNCTION IF EXISTS public.compute_engagement_rate() CASCADE;

CREATE OR REPLACE FUNCTION public.compute_engagement_rate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.reach IS NOT NULL AND NEW.reach > 0 THEN
    NEW.engagement_rate := ((COALESCE(NEW.likes, 0) + COALESCE(NEW.comments, 0) + COALESCE(NEW.shares, 0) + COALESCE(NEW.saves, 0))::FLOAT / NEW.reach) * 100;
  ELSIF NEW.impressions IS NOT NULL AND NEW.impressions > 0 THEN
    NEW.engagement_rate := ((COALESCE(NEW.likes, 0) + COALESCE(NEW.comments, 0) + COALESCE(NEW.shares, 0) + COALESCE(NEW.saves, 0))::FLOAT / NEW.impressions) * 100;
  ELSE
    NEW.engagement_rate := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- Recreate the trigger
DROP TRIGGER IF EXISTS compute_engagement_rate_trigger ON public.post_metrics;
CREATE TRIGGER compute_engagement_rate_trigger
  BEFORE INSERT OR UPDATE ON public.post_metrics
  FOR EACH ROW
  EXECUTE FUNCTION public.compute_engagement_rate();