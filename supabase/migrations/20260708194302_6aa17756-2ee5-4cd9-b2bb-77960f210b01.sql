
-- Prevent duplicate signups per user (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS uq_founders_signups_user
  ON public.founders_signups(user_id);

-- Atomic slot claiming: takes an advisory lock, counts founders,
-- inserts row for the user, returns { coupon_id, slot_number, is_founder }.
-- Idempotent: if the user already has a row, returns that row.
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
  v_founders_count INT;
  v_chosen_coupon TEXT;
BEGIN
  -- Serialize this critical section across all callers
  PERFORM pg_advisory_xact_lock(hashtext('founders_slot_claim'));

  -- Idempotency: already claimed?
  SELECT fs.coupon_id INTO v_existing_coupon
  FROM public.founders_signups fs
  WHERE fs.user_id = _user_id
  LIMIT 1;

  IF v_existing_coupon IS NOT NULL THEN
    SELECT COALESCE(
      (SELECT COUNT(*)::int FROM public.founders_signups
       WHERE claimed_at <= (SELECT claimed_at FROM public.founders_signups WHERE user_id = _user_id)
         AND coupon_id = 'PRO-FOUNDERS-24M'), 0)
    INTO v_founders_count;
    RETURN QUERY SELECT v_existing_coupon,
      CASE WHEN v_existing_coupon = 'PRO-FOUNDERS-24M' THEN v_founders_count ELSE NULL END,
      v_existing_coupon = 'PRO-FOUNDERS-24M';
    RETURN;
  END IF;

  SELECT COUNT(*)::int INTO v_founders_count
  FROM public.founders_signups
  WHERE coupon_id = _founders_coupon;

  IF v_founders_count < _max_slots THEN
    v_chosen_coupon := _founders_coupon;
    v_founders_count := v_founders_count + 1;
  ELSE
    v_chosen_coupon := _launch_coupon;
  END IF;

  INSERT INTO public.founders_signups (user_id, stripe_customer_id, coupon_id)
  VALUES (_user_id, _stripe_customer_id, v_chosen_coupon);

  RETURN QUERY SELECT v_chosen_coupon,
    CASE WHEN v_chosen_coupon = _founders_coupon THEN v_founders_count ELSE NULL END,
    v_chosen_coupon = _founders_coupon;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_founders_slot(UUID, TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_founders_slot(UUID, TEXT, TEXT, TEXT, INTEGER) TO service_role;
