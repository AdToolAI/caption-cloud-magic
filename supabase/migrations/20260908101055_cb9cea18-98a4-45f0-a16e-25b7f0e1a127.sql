DROP FUNCTION IF EXISTS public.refund_ai_video_credits(uuid, numeric, uuid);

CREATE OR REPLACE FUNCTION public.refund_ai_video_credits(
  p_user_id uuid,
  p_amount_euros numeric,
  p_generation_id uuid,
  p_refund_key text DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance NUMERIC;
  v_currency TEXT;
  v_factor NUMERIC := public.get_ai_discount_factor(p_user_id);
  v_amount NUMERIC := round(GREATEST(COALESCE(p_amount_euros, 0), 0) * v_factor, 2);
  v_key TEXT;
BEGIN
  v_key := COALESCE(
    NULLIF(btrim(COALESCE(p_refund_key, '')), ''),
    CASE WHEN p_generation_id IS NULL THEN NULL
         ELSE 'gen:' || p_generation_id::text || ':failure' END
  );

  SELECT currency INTO v_currency
  FROM public.ai_video_wallets
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    v_currency := 'EUR';
  END IF;

  -- Idempotency: the same run + reason may only ever be credited once.
  IF v_key IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.ai_video_transactions
    WHERE metadata->>'refund_key' = v_key
  ) THEN
    SELECT balance_euros INTO v_new_balance
    FROM public.ai_video_wallets WHERE user_id = p_user_id;
    RETURN COALESCE(v_new_balance, 0);
  END IF;

  BEGIN
    UPDATE public.ai_video_wallets
    SET balance_euros = balance_euros + v_amount,
        total_spent_euros = GREATEST(total_spent_euros - v_amount, 0),
        updated_at = NOW()
    WHERE user_id = p_user_id
    RETURNING balance_euros INTO v_new_balance;

    INSERT INTO public.ai_video_transactions (
      user_id, currency, type, amount_euros, balance_after, generation_id, description, metadata
    ) VALUES (
      p_user_id, v_currency, 'refund', v_amount, v_new_balance, p_generation_id,
      'AI video generation refund',
      jsonb_build_object(
        'list_amount_euros', round(GREATEST(COALESCE(p_amount_euros, 0), 0), 2),
        'discount_factor', v_factor
      ) || CASE WHEN v_key IS NULL THEN '{}'::jsonb
                ELSE jsonb_build_object('refund_key', v_key) END
    );
  EXCEPTION WHEN unique_violation THEN
    -- A concurrent refund for the same run + reason won the race.
    SELECT balance_euros INTO v_new_balance
    FROM public.ai_video_wallets WHERE user_id = p_user_id;
    RETURN COALESCE(v_new_balance, 0);
  END;

  RETURN v_new_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.refund_ai_video_credits(uuid, numeric, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refund_ai_video_credits(uuid, numeric, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_ai_video_credits(uuid, numeric, uuid, text) TO authenticated;