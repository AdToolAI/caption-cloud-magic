
-- Extend founders_signups with revocation tracking
ALTER TABLE public.founders_signups
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_reason text;

CREATE INDEX IF NOT EXISTS idx_founders_signups_active
  ON public.founders_signups(user_id) WHERE revoked_at IS NULL;

-- Read helper: is user an active founder?
CREATE OR REPLACE FUNCTION public.is_founder_active(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.founders_signups
    WHERE user_id = _user_id
      AND coupon_id = 'PRO-FOUNDERS-24M'
      AND revoked_at IS NULL
      AND claimed_at > (now() - interval '24 months')
  );
$$;

REVOKE ALL ON FUNCTION public.is_founder_active(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_founder_active(uuid) TO authenticated, service_role;

-- Read helper: when does founder status expire?
CREATE OR REPLACE FUNCTION public.founder_status_details(_user_id uuid)
RETURNS TABLE (is_active boolean, claimed_at timestamptz, expires_at timestamptz, revoked_at timestamptz, revoked_reason text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (fs.revoked_at IS NULL AND fs.claimed_at > (now() - interval '24 months') AND fs.coupon_id = 'PRO-FOUNDERS-24M') AS is_active,
    fs.claimed_at,
    fs.claimed_at + interval '24 months' AS expires_at,
    fs.revoked_at,
    fs.revoked_reason
  FROM public.founders_signups fs
  WHERE fs.user_id = _user_id
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.founder_status_details(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.founder_status_details(uuid) TO authenticated, service_role;

-- Revocation RPC (service_role only)
CREATE OR REPLACE FUNCTION public.revoke_founder_status(_user_id uuid, _reason text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated int;
BEGIN
  UPDATE public.founders_signups
     SET revoked_at = now(),
         revoked_reason = COALESCE(_reason, 'unknown')
   WHERE user_id = _user_id
     AND revoked_at IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;
REVOKE ALL ON FUNCTION public.revoke_founder_status(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_founder_status(uuid, text) TO service_role;

-- Update slot claim: count only active (non-revoked) slots; reactivate own revoked slot if room
CREATE OR REPLACE FUNCTION public.claim_founders_slot(
  _user_id UUID,
  _stripe_customer_id TEXT,
  _founders_coupon TEXT DEFAULT 'PRO-FOUNDERS-24M',
  _launch_coupon TEXT DEFAULT 'PRO-LAUNCH-3M',
  _max_slots INTEGER DEFAULT 1000
)
RETURNS TABLE (coupon_id TEXT, slot_number INT, is_founder BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_coupon TEXT;
  v_existing_revoked timestamptz;
  v_founders_count INT;
  v_chosen_coupon TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('founders_slot_claim'));

  SELECT fs.coupon_id, fs.revoked_at INTO v_existing_coupon, v_existing_revoked
  FROM public.founders_signups fs
  WHERE fs.user_id = _user_id
  LIMIT 1;

  -- Existing non-revoked row → idempotent return
  IF v_existing_coupon IS NOT NULL AND v_existing_revoked IS NULL THEN
    SELECT COALESCE(
      (SELECT COUNT(*)::int FROM public.founders_signups
       WHERE claimed_at <= (SELECT claimed_at FROM public.founders_signups WHERE user_id = _user_id)
         AND coupon_id = 'PRO-FOUNDERS-24M'
         AND revoked_at IS NULL), 0)
    INTO v_founders_count;
    RETURN QUERY SELECT v_existing_coupon,
      CASE WHEN v_existing_coupon = 'PRO-FOUNDERS-24M' THEN v_founders_count ELSE NULL END,
      v_existing_coupon = 'PRO-FOUNDERS-24M';
    RETURN;
  END IF;

  -- Count active founder slots only
  SELECT COUNT(*)::int INTO v_founders_count
  FROM public.founders_signups
  WHERE coupon_id = _founders_coupon
    AND revoked_at IS NULL;

  IF v_founders_count < _max_slots THEN
    v_chosen_coupon := _founders_coupon;
    v_founders_count := v_founders_count + 1;
  ELSE
    v_chosen_coupon := _launch_coupon;
  END IF;

  IF v_existing_coupon IS NOT NULL AND v_existing_revoked IS NOT NULL THEN
    -- Reactivate the revoked row for this user
    UPDATE public.founders_signups
       SET coupon_id = v_chosen_coupon,
           stripe_customer_id = _stripe_customer_id,
           claimed_at = now(),
           revoked_at = NULL,
           revoked_reason = NULL
     WHERE user_id = _user_id;
  ELSE
    INSERT INTO public.founders_signups (user_id, stripe_customer_id, coupon_id)
    VALUES (_user_id, _stripe_customer_id, v_chosen_coupon);
  END IF;

  RETURN QUERY SELECT v_chosen_coupon,
    CASE WHEN v_chosen_coupon = _founders_coupon THEN v_founders_count ELSE NULL END,
    v_chosen_coupon = _founders_coupon;
END;
$$;
