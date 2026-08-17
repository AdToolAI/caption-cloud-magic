CREATE UNIQUE INDEX IF NOT EXISTS ai_video_transactions_refund_charge_uniq
ON public.ai_video_transactions (
  (metadata->>'refund_charge_id')
)
WHERE type = 'refund'
  AND metadata ? 'refund_charge_id';

CREATE OR REPLACE FUNCTION public.composer_refund_charge(
  p_charge_id uuid,
  p_run_id uuid,
  p_refund_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_charge public.ai_video_transactions%ROWTYPE;
  v_provenance_ok boolean := false;
  v_existing_id uuid;
  v_amount numeric(10,2);
  v_new_balance numeric(10,2);
  v_refund_id uuid;
  v_constraint text;
BEGIN
  IF p_refund_reason IS NULL OR btrim(p_refund_reason) = '' THEN
    RAISE EXCEPTION 'composer_refund_charge: p_refund_reason must not be empty';
  END IF;

  IF p_charge_id IS NULL OR p_run_id IS NULL THEN
    RETURN jsonb_build_object('outcome', 'no_charge', 'amount_euros', 0, 'refund_transaction_id', NULL);
  END IF;

  SELECT * INTO v_charge
  FROM public.ai_video_transactions
  WHERE id = p_charge_id
    AND type = 'deduction'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'no_charge', 'amount_euros', 0, 'refund_transaction_id', NULL);
  END IF;

  IF v_charge.generation_id IS NOT NULL AND v_charge.generation_id = p_run_id THEN
    v_provenance_ok := true;
  ELSIF v_charge.metadata IS NOT NULL
        AND v_charge.metadata->>'run_id' IS NOT NULL
        AND v_charge.metadata->>'run_id' = p_run_id::text THEN
    v_provenance_ok := true;
  ELSIF v_charge.metadata IS NOT NULL
        AND v_charge.metadata->>'reservation_id' IS NOT NULL THEN
    SELECT true INTO v_provenance_ok
    FROM public.composer_run_reservations r
    WHERE r.id::text = v_charge.metadata->>'reservation_id'
      AND p_run_id = ANY (r.run_ids)
    LIMIT 1;
    v_provenance_ok := COALESCE(v_provenance_ok, false);
  END IF;

  IF NOT v_provenance_ok THEN
    RETURN jsonb_build_object('outcome', 'no_charge', 'amount_euros', 0, 'refund_transaction_id', NULL);
  END IF;

  SELECT id INTO v_existing_id
  FROM public.ai_video_transactions
  WHERE type = 'refund'
    AND metadata->>'refund_charge_id' = p_charge_id::text
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('outcome', 'already_refunded', 'amount_euros', 0, 'refund_transaction_id', v_existing_id);
  END IF;

  v_amount := abs(v_charge.amount_euros);

  IF v_amount = 0 THEN
    RETURN jsonb_build_object('outcome', 'no_charge', 'amount_euros', 0, 'refund_transaction_id', NULL);
  END IF;

  BEGIN
    UPDATE public.ai_video_wallets
    SET balance_euros = balance_euros + v_amount,
        updated_at = now()
    WHERE user_id = v_charge.user_id
    RETURNING balance_euros INTO v_new_balance;

    IF v_new_balance IS NULL THEN
      RETURN jsonb_build_object('outcome', 'no_charge', 'amount_euros', 0, 'refund_transaction_id', NULL);
    END IF;

    INSERT INTO public.ai_video_transactions (
      user_id, type, amount_euros, balance_after, description, currency, metadata
    ) VALUES (
      v_charge.user_id,
      'refund',
      v_amount,
      v_new_balance,
      'Refund for charge ' || p_charge_id::text,
      v_charge.currency,
      jsonb_build_object(
        'refund_charge_id', p_charge_id::text,
        'run_id', p_run_id::text,
        'refund_reason', p_refund_reason
      )
    )
    RETURNING id INTO v_refund_id;
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint <> 'ai_video_transactions_refund_charge_uniq' THEN
        RAISE;
      END IF;
      SELECT id INTO v_existing_id
      FROM public.ai_video_transactions
      WHERE type = 'refund'
        AND metadata->>'refund_charge_id' = p_charge_id::text
      LIMIT 1;
      RETURN jsonb_build_object('outcome', 'already_refunded', 'amount_euros', 0, 'refund_transaction_id', v_existing_id);
  END;

  RETURN jsonb_build_object('outcome', 'refunded', 'amount_euros', v_amount, 'refund_transaction_id', v_refund_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.composer_refund_charge(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.composer_refund_charge(uuid, uuid, text) TO service_role;