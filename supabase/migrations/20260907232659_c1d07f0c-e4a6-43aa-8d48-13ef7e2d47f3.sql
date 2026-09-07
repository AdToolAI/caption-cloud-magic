CREATE OR REPLACE FUNCTION public.stripe_revoke_ai_video_credits_for_refund(
  p_stripe_session_id text,
  p_refund_id text,
  p_refund_amount_minor bigint,
  p_charge_amount_minor bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_purchase public.ai_video_transactions%ROWTYPE;
  v_bonus_total NUMERIC := 0;
  v_granted NUMERIC := 0;
  v_ratio NUMERIC;
  v_target NUMERIC;
  v_balance NUMERIC;
  v_currency TEXT;
  v_applied NUMERIC;
  v_new_balance NUMERIC;
  v_key TEXT;
  v_tx_id UUID;
BEGIN
  IF p_refund_id IS NULL OR p_stripe_session_id IS NULL THEN
    RETURN jsonb_build_object('reversed', false, 'reason', 'missing_identifiers');
  END IF;

  v_key := 'stripe_refund:' || p_refund_id || ':' || p_stripe_session_id;

  IF EXISTS (SELECT 1 FROM public.ai_video_transactions WHERE metadata->>'refund_key' = v_key) THEN
    RETURN jsonb_build_object('reversed', false, 'reason', 'already_reversed', 'refund_key', v_key);
  END IF;

  SELECT * INTO v_purchase
  FROM public.ai_video_transactions
  WHERE stripe_checkout_session_id = p_stripe_session_id AND type = 'purchase'
  ORDER BY created_at ASC LIMIT 1;

  IF v_purchase.id IS NULL THEN
    RETURN jsonb_build_object('reversed', false, 'reason', 'no_purchase_found');
  END IF;

  SELECT COALESCE(SUM(amount_euros), 0) INTO v_bonus_total
  FROM public.ai_video_transactions
  WHERE user_id = v_purchase.user_id
    AND type = 'bonus'
    AND created_at BETWEEN v_purchase.created_at - interval '1 minute'
                       AND v_purchase.created_at + interval '1 minute';

  v_granted := COALESCE(v_purchase.amount_euros, 0) + COALESCE(v_bonus_total, 0);
  IF v_granted <= 0 THEN
    RETURN jsonb_build_object('reversed', false, 'reason', 'zero_grant');
  END IF;

  IF COALESCE(p_charge_amount_minor, 0) > 0 AND COALESCE(p_refund_amount_minor, 0) > 0 THEN
    v_ratio := LEAST(1, p_refund_amount_minor::numeric / p_charge_amount_minor::numeric);
  ELSE
    v_ratio := 1;
  END IF;

  v_target := round(v_granted * v_ratio, 2);
  IF v_target <= 0 THEN
    RETURN jsonb_build_object('reversed', false, 'reason', 'zero_amount');
  END IF;

  SELECT balance_euros, currency INTO v_balance, v_currency
  FROM public.ai_video_wallets
  WHERE user_id = v_purchase.user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('reversed', false, 'reason', 'no_wallet');
  END IF;

  -- Bereits verbrauchtes Guthaben wird nicht ins Minus gebucht.
  v_applied := LEAST(v_target, GREATEST(v_balance, 0));

  UPDATE public.ai_video_wallets
  SET balance_euros = balance_euros - v_applied,
      total_purchased_euros = GREATEST(0, total_purchased_euros - LEAST(COALESCE(v_purchase.amount_euros,0) * v_ratio, total_purchased_euros)),
      updated_at = NOW()
  WHERE user_id = v_purchase.user_id
  RETURNING balance_euros INTO v_new_balance;

  INSERT INTO public.ai_video_transactions (
    user_id, currency, type, amount_euros, balance_after,
    stripe_checkout_session_id, description, metadata
  ) VALUES (
    v_purchase.user_id, COALESCE(v_currency, v_purchase.currency, 'EUR'), 'refund',
    -v_applied, v_new_balance, p_stripe_session_id,
    'Stripe refund reversal',
    jsonb_build_object(
      'refund_key', v_key,
      'stripe_refund_id', p_refund_id,
      'source_transaction_id', v_purchase.id,
      'granted_euros', v_granted,
      'target_euros', v_target,
      'unrecovered_euros', round(v_target - v_applied, 2),
      'refund_ratio', v_ratio
    )
  )
  RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object(
    'reversed', true,
    'transaction_id', v_tx_id,
    'target_euros', v_target,
    'reversed_euros', v_applied,
    'unrecovered_euros', round(v_target - v_applied, 2),
    'balance_after', v_new_balance,
    'refund_key', v_key
  );
END;
$$;

REVOKE ALL ON FUNCTION public.stripe_revoke_ai_video_credits_for_refund(text, text, bigint, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stripe_revoke_ai_video_credits_for_refund(text, text, bigint, bigint) TO service_role;