-- 1. ab_test_events: replace anonymous-insert policy with authenticated + ownership check
DROP POLICY IF EXISTS "Anyone can insert events" ON public.ab_test_events;

CREATE POLICY "Authenticated can insert events for own tests"
ON public.ab_test_events
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.ab_tests
    WHERE ab_tests.id = ab_test_events.test_id
      AND ab_tests.user_id = auth.uid()
  )
);

-- 2. profiles: prevent client privilege escalation on billing/plan columns
DROP POLICY IF EXISTS "Users can update own test_mode_plan" ON public.profiles;

CREATE OR REPLACE FUNCTION public.prevent_profile_privileged_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_service_role boolean := (current_setting('request.jwt.claim.role', true) = 'service_role')
                             OR (auth.role() = 'service_role');
BEGIN
  IF is_service_role THEN
    RETURN NEW;
  END IF;

  IF NEW.plan IS DISTINCT FROM OLD.plan
     OR NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
     OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
     OR NEW.stripe_subscription_id IS DISTINCT FROM OLD.stripe_subscription_id
     OR NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at
     OR NEW.test_mode_plan IS DISTINCT FROM OLD.test_mode_plan
     OR NEW.qa_budget_cents IS DISTINCT FROM OLD.qa_budget_cents
     OR NEW.storage_limit_mb IS DISTINCT FROM OLD.storage_limit_mb
  THEN
    RAISE EXCEPTION 'Privileged profile fields can only be modified server-side';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_privileged_updates ON public.profiles;
CREATE TRIGGER trg_prevent_profile_privileged_updates
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_privileged_updates();