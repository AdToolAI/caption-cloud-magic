DO $$
DECLARE
  v_user_id uuid;
  v_generation_id uuid := '4e6cbb81-b8d5-4fbc-9265-a04d1db3cb43';
  v_refund_amount numeric := 1.08;
  v_new_balance numeric;
BEGIN
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = 'bestofproducts4u@gmail.com'
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User bestofproducts4u@gmail.com not found';
  END IF;

  UPDATE public.ai_video_wallets
     SET balance_euros = balance_euros + v_refund_amount,
         updated_at = now()
   WHERE user_id = v_user_id
   RETURNING balance_euros INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    RAISE EXCEPTION 'No ai_video_wallets row for user %', v_user_id;
  END IF;

  INSERT INTO public.ai_video_transactions (
    user_id,
    type,
    amount_euros,
    balance_after,
    generation_id,
    description,
    metadata,
    currency,
    created_at
  ) VALUES (
    v_user_id,
    'refund',
    v_refund_amount,
    v_new_balance,
    v_generation_id,
    'pricing_desync_seedance_mini: overcharged 0.15 EUR/s instead of catalog 0.06 EUR/s (12s clip). Refund of 1.08 EUR issued.',
    jsonb_build_object(
      'reason', 'pricing_desync_seedance_mini',
      'expected_rate_eur', 0.06,
      'charged_rate_eur', 0.15,
      'duration_seconds', 12
    ),
    'EUR',
    now()
  );
END $$;