-- Refund idempotency for AI video runs.
--
-- Proves that a single failed generation can be credited back at most once,
-- no matter how many code paths (function catch, poller, webhook retry,
-- manual recovery) call `refund_ai_video_credits`, while a genuinely
-- different reason (smart-duration true-up) stays possible.
--
-- Run inside a transaction and ROLLBACK — it touches no real data.

BEGIN;

DO $$
DECLARE
  v_user uuid := gen_random_uuid();
  v_gen uuid := gen_random_uuid();
  v_balance numeric;
  v_refunds int;
  v_sum numeric;
BEGIN
  INSERT INTO public.ai_video_wallets (user_id, balance_euros, total_purchased_euros, total_spent_euros, currency)
  VALUES (v_user, 0, 10, 10, 'EUR');

  -- 1. Four independent refund attempts for the same failed run.
  PERFORM public.refund_ai_video_credits(v_user, 3.96, v_gen);
  PERFORM public.refund_ai_video_credits(v_user, 3.96, v_gen);
  PERFORM public.refund_ai_video_credits(v_user, 3.96, v_gen);
  PERFORM public.refund_ai_video_credits(v_user, 3.96, v_gen, 'gen:' || v_gen::text || ':failure');

  SELECT balance_euros INTO v_balance FROM public.ai_video_wallets WHERE user_id = v_user;
  SELECT count(*), COALESCE(sum(amount_euros), 0) INTO v_refunds, v_sum
  FROM public.ai_video_transactions WHERE user_id = v_user AND type = 'refund';

  IF v_refunds <> 1 THEN
    RAISE EXCEPTION 'expected exactly 1 refund entry, got %', v_refunds;
  END IF;
  IF v_sum <> 3.96 OR v_balance <> 3.96 THEN
    RAISE EXCEPTION 'expected 3.96 credited once, got sum=% balance=%', v_sum, v_balance;
  END IF;

  -- 2. The ledger entry references the original run.
  IF NOT EXISTS (
    SELECT 1 FROM public.ai_video_transactions
    WHERE user_id = v_user AND type = 'refund' AND generation_id = v_gen
      AND metadata->>'refund_key' = 'gen:' || v_gen::text || ':failure'
  ) THEN
    RAISE EXCEPTION 'refund entry is not tied to the original generation';
  END IF;

  -- 3. A different reason on the same run is still allowed exactly once.
  PERFORM public.refund_ai_video_credits(v_user, 1.00, v_gen, 'gen:' || v_gen::text || ':smart_duration');
  PERFORM public.refund_ai_video_credits(v_user, 1.00, v_gen, 'gen:' || v_gen::text || ':smart_duration');

  SELECT count(*), COALESCE(sum(amount_euros), 0) INTO v_refunds, v_sum
  FROM public.ai_video_transactions WHERE user_id = v_user AND type = 'refund';
  IF v_refunds <> 2 OR v_sum <> 4.96 THEN
    RAISE EXCEPTION 'smart-duration true-up wrong: count=% sum=%', v_refunds, v_sum;
  END IF;

  -- 4. Two different runs are never confused with each other.
  PERFORM public.refund_ai_video_credits(v_user, 2.00, gen_random_uuid());
  SELECT count(*) INTO v_refunds FROM public.ai_video_transactions WHERE user_id = v_user AND type = 'refund';
  IF v_refunds <> 3 THEN
    RAISE EXCEPTION 'a second run must get its own refund, count=%', v_refunds;
  END IF;

  RAISE NOTICE 'refund idempotency: all checks passed';
END $$;

ROLLBACK;
