-- V459 — Euro-Ledger als einzige Kasse für Lip-Sync-Belastung und -Erstattung.

CREATE UNIQUE INDEX IF NOT EXISTS ai_video_transactions_refund_key_uniq
  ON public.ai_video_transactions ((metadata->>'refund_key'))
  WHERE metadata ? 'refund_key';

CREATE OR REPLACE FUNCTION public.v459_deduct_ai_video_credits(
  p_user_id uuid,
  p_amount numeric,
  p_generation_id uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_current_balance NUMERIC;
  v_new_balance NUMERIC;
  v_currency TEXT;
  v_factor NUMERIC := public.get_ai_discount_factor(p_user_id);
  v_amount NUMERIC := round(GREATEST(COALESCE(p_amount, 0), 0) * v_factor, 2);
  v_tx_id UUID;
BEGIN
  SELECT balance_euros, currency INTO v_current_balance, v_currency
  FROM public.ai_video_wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found for user';
  END IF;

  IF v_current_balance < v_amount THEN
    RAISE EXCEPTION 'Insufficient credits'
      USING DETAIL = format('required=%s available=%s', v_amount, v_current_balance);
  END IF;

  UPDATE public.ai_video_wallets
  SET balance_euros = balance_euros - v_amount,
      total_spent_euros = total_spent_euros + v_amount,
      updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING balance_euros INTO v_new_balance;

  INSERT INTO public.ai_video_transactions (
    user_id, currency, type, amount_euros, balance_after, generation_id, description, metadata
  ) VALUES (
    p_user_id, v_currency, 'deduction', -v_amount, v_new_balance, p_generation_id,
    'Video generation cost',
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'list_amount_euros', round(GREATEST(COALESCE(p_amount, 0), 0), 2),
      'discount_factor', v_factor
    )
  )
  RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object(
    'transaction_id', v_tx_id,
    'amount_euros', v_amount,
    'balance_after', v_new_balance
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.v459_refund_lipsync_euros(
  p_user_id uuid,
  p_scene_id uuid,
  p_run_id text DEFAULT NULL,
  p_source_transaction_id uuid DEFAULT NULL,
  p_reason text DEFAULT 'lipsync_failure'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_src public.ai_video_transactions%ROWTYPE;
  v_key TEXT;
  v_amount NUMERIC;
  v_new_balance NUMERIC;
  v_currency TEXT;
  v_tx_id UUID;
BEGIN
  IF p_source_transaction_id IS NOT NULL THEN
    SELECT * INTO v_src FROM public.ai_video_transactions
    WHERE id = p_source_transaction_id AND user_id = p_user_id AND type = 'deduction';
  END IF;

  IF v_src.id IS NULL AND p_run_id IS NOT NULL THEN
    SELECT * INTO v_src FROM public.ai_video_transactions
    WHERE user_id = p_user_id AND type = 'deduction'
      AND metadata->>'run_id' = p_run_id
    ORDER BY created_at DESC LIMIT 1;
  END IF;

  IF v_src.id IS NULL AND p_scene_id IS NOT NULL THEN
    SELECT * INTO v_src FROM public.ai_video_transactions
    WHERE user_id = p_user_id AND type = 'deduction'
      AND metadata->>'scene_id' = p_scene_id::text
    ORDER BY created_at DESC LIMIT 1;
  END IF;

  IF v_src.id IS NULL THEN
    RETURN jsonb_build_object('refunded', false, 'reason', 'no_source_debit');
  END IF;

  v_key := 'lipsync_refund:' || COALESCE(p_run_id, '-') || ':' || v_src.id::text;

  IF EXISTS (
    SELECT 1 FROM public.ai_video_transactions WHERE metadata->>'refund_key' = v_key
  ) THEN
    RETURN jsonb_build_object('refunded', false, 'reason', 'already_refunded', 'refund_key', v_key);
  END IF;

  v_amount := ABS(COALESCE(v_src.amount_euros, 0));
  IF v_amount <= 0 THEN
    RETURN jsonb_build_object('refunded', false, 'reason', 'zero_amount');
  END IF;

  UPDATE public.ai_video_wallets
  SET balance_euros = balance_euros + v_amount,
      total_spent_euros = GREATEST(0, total_spent_euros - v_amount),
      updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING balance_euros, currency INTO v_new_balance, v_currency;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('refunded', false, 'reason', 'no_wallet');
  END IF;

  INSERT INTO public.ai_video_transactions (
    user_id, currency, type, amount_euros, balance_after, generation_id, description, metadata
  ) VALUES (
    p_user_id, COALESCE(v_currency, 'EUR'), 'refund', v_amount, v_new_balance, v_src.generation_id,
    'Lip-sync failure refund',
    jsonb_build_object(
      'refund_key', v_key,
      'source_transaction_id', v_src.id,
      'scene_id', p_scene_id,
      'run_id', p_run_id,
      'reason', p_reason
    )
  )
  RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object(
    'refunded', true,
    'amount_euros', v_amount,
    'transaction_id', v_tx_id,
    'source_transaction_id', v_src.id,
    'refund_key', v_key,
    'balance_after', v_new_balance
  );
END;
$$;

REVOKE ALL ON FUNCTION public.v459_deduct_ai_video_credits(uuid, numeric, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.v459_refund_lipsync_euros(uuid, uuid, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v459_deduct_ai_video_credits(uuid, numeric, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.v459_refund_lipsync_euros(uuid, uuid, text, uuid, text) TO service_role;