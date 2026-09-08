-- TICKET-composer-refund-key-granularity
-- Refund key must identify the charged attempt (scene + run), not only the scene.
CREATE OR REPLACE FUNCTION public.composer_refund_scene_run(
  p_user_id uuid,
  p_scene_id uuid,
  p_run_id uuid,
  p_amount_euros numeric,
  p_reason text DEFAULT 'failure'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_reason text := COALESCE(NULLIF(regexp_replace(btrim(COALESCE(p_reason, '')), '[^a-zA-Z0-9_\-]', '_', 'g'), ''), 'failure');
  v_key text;
  v_legacy boolean := (p_run_id IS NULL);
  v_factor numeric := public.get_ai_discount_factor(p_user_id);
  v_charge_id uuid;
  v_charged numeric := NULL;
  v_already numeric := 0;
  v_cap numeric := NULL;
  v_list numeric := round(GREATEST(COALESCE(p_amount_euros, 0), 0), 2);
  v_before uuid;
  v_refund_id uuid;
  v_balance numeric;
  v_refunded numeric := 0;
BEGIN
  IF p_user_id IS NULL OR p_scene_id IS NULL THEN
    RETURN jsonb_build_object('outcome', 'invalid', 'amount_euros', 0, 'refund_transaction_id', NULL);
  END IF;

  -- 1. Key = charged attempt. Legacy (no run id) keeps the historical scene key,
  --    which is strictly at-most-once and therefore can never over-refund.
  v_key := CASE WHEN v_legacy
    THEN 'gen:' || p_scene_id::text || ':' || v_reason
    ELSE 'gen:' || p_scene_id::text || ':' || p_run_id::text || ':' || v_reason
  END;

  -- 2. Locate the matching charge (run-scoped first, scene/legacy second).
  IF NOT v_legacy THEN
    SELECT id, abs(amount_euros) INTO v_charge_id, v_charged
    FROM public.ai_video_transactions
    WHERE user_id = p_user_id AND type = 'deduction'
      AND (
        generation_id = p_run_id
        OR metadata->>'run_id' = p_run_id::text
        OR (jsonb_typeof(metadata->'run_ids') = 'array' AND metadata->'run_ids' ? p_run_id::text)
      )
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;
  IF v_charge_id IS NULL THEN
    SELECT id, abs(amount_euros) INTO v_charge_id, v_charged
    FROM public.ai_video_transactions
    WHERE user_id = p_user_id AND type = 'deduction'
      AND (
        generation_id = p_scene_id
        OR metadata->>'scene_id' = p_scene_id::text
        OR (jsonb_typeof(metadata->'scene_ids') = 'array' AND metadata->'scene_ids' ? p_scene_id::text)
      )
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  -- 3. Bound: charge minus everything already refunded against that charge.
  IF v_charge_id IS NOT NULL THEN
    SELECT COALESCE(sum(amount_euros), 0) INTO v_already
    FROM public.ai_video_transactions
    WHERE user_id = p_user_id AND type = 'refund'
      AND (metadata->>'bounded_charge_id' = v_charge_id::text
        OR metadata->>'refund_charge_id' = v_charge_id::text);
    v_cap := GREATEST(v_charged - v_already, 0);
    IF v_cap <= 0 THEN
      SELECT balance_euros INTO v_balance FROM public.ai_video_wallets WHERE user_id = p_user_id;
      RETURN jsonb_build_object('outcome', 'charge_exhausted', 'amount_euros', 0,
        'refund_transaction_id', NULL, 'refund_key', v_key, 'bounded_charge_id', v_charge_id,
        'balance_after', COALESCE(v_balance, 0));
    END IF;
    IF v_factor > 0 AND round(v_list * v_factor, 2) > v_cap THEN
      v_list := trunc(v_cap / v_factor, 2);
      WHILE v_list > 0 AND round(v_list * v_factor, 2) > v_cap LOOP
        v_list := v_list - 0.01;
      END LOOP;
    END IF;
  END IF;

  -- 4. Idempotent credit via the canonical wallet function (unique refund_key index).
  SELECT id INTO v_before FROM public.ai_video_transactions WHERE metadata->>'refund_key' = v_key LIMIT 1;
  IF v_before IS NOT NULL THEN
    SELECT balance_euros INTO v_balance FROM public.ai_video_wallets WHERE user_id = p_user_id;
    RETURN jsonb_build_object('outcome', 'already_refunded', 'amount_euros', 0,
      'refund_transaction_id', v_before, 'refund_key', v_key, 'balance_after', COALESCE(v_balance, 0));
  END IF;

  v_balance := public.refund_ai_video_credits(p_user_id, v_list, p_scene_id, v_key);

  SELECT id, amount_euros INTO v_refund_id, v_refunded
  FROM public.ai_video_transactions WHERE metadata->>'refund_key' = v_key LIMIT 1;

  IF v_refund_id IS NOT NULL AND v_refund_id IS DISTINCT FROM v_before THEN
    UPDATE public.ai_video_transactions
    SET metadata = metadata || jsonb_strip_nulls(jsonb_build_object(
      'scene_id', p_scene_id::text,
      'run_id', CASE WHEN p_run_id IS NULL THEN NULL ELSE p_run_id::text END,
      'bounded_charge_id', CASE WHEN v_charge_id IS NULL THEN NULL ELSE v_charge_id::text END,
      'refund_source', 'composer_refund_scene_run',
      'legacy_scene_key', v_legacy
    ))
    WHERE id = v_refund_id;
    RETURN jsonb_build_object('outcome', 'refunded', 'amount_euros', v_refunded,
      'refund_transaction_id', v_refund_id, 'refund_key', v_key,
      'bounded_charge_id', v_charge_id, 'balance_after', v_balance);
  END IF;

  -- Lost the race against a concurrent caller: exactly one row exists.
  RETURN jsonb_build_object('outcome', 'already_refunded', 'amount_euros', 0,
    'refund_transaction_id', v_refund_id, 'refund_key', v_key, 'balance_after', v_balance);
END;
$function$;

REVOKE ALL ON FUNCTION public.composer_refund_scene_run(uuid, uuid, uuid, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.composer_refund_scene_run(uuid, uuid, uuid, numeric, text) TO service_role;