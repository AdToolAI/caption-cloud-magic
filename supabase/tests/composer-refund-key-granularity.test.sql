-- Composer refund key granularity (TICKET-composer-refund-key-granularity).
--
-- The refund idempotency key must identify the charged attempt (scene + run),
-- not only the scene. Proves:
--   1. same scene, same charged run, refund retried twice  → exactly one refund
--   2. same scene, second distinct charged run fails         → second refund allowed
--   3. two concurrent refund attempts for the same run       → one refund
--      (second caller hits the unique refund_key index and reports already_refunded)
--   4. legacy rows without run id                            → deterministic
--      scene-level fallback key, exactly one refund, never above the charge
--   5. refund is bounded by the matching charge (no over-refund)
--
-- Run inside a transaction and ROLLBACK — it touches no real data.

BEGIN;

DO $$
DECLARE
  v_user uuid := gen_random_uuid();
  v_scene uuid := gen_random_uuid();
  v_run1 uuid := gen_random_uuid();
  v_run2 uuid := gen_random_uuid();
  v_legacy_scene uuid := gen_random_uuid();
  v_r jsonb;
  v_r2 jsonb;
  v_balance numeric;
  v_count int;
  v_sum numeric;
  v_key1 text;
  v_key2 text;
BEGIN
  INSERT INTO public.ai_video_wallets (user_id, balance_euros, total_purchased_euros, total_spent_euros, currency)
  VALUES (v_user, 100, 100, 0, 'EUR');

  -- Two separate charges on the SAME scene (attempt #1 and attempt #2), 4.50 each.
  PERFORM public.v459_deduct_ai_video_credits(v_user, 4.50, v_scene,
    jsonb_build_object('scene_id', v_scene::text, 'run_id', v_run1::text, 'source', 'test'));
  PERFORM public.v459_deduct_ai_video_credits(v_user, 4.50, v_scene,
    jsonb_build_object('scene_id', v_scene::text, 'run_id', v_run2::text, 'source', 'test'));

  SELECT balance_euros INTO v_balance FROM public.ai_video_wallets WHERE user_id = v_user;
  IF v_balance <> 91.00 THEN RAISE EXCEPTION 'setup: expected balance 91.00 got %', v_balance; END IF;

  ------------------------------------------------------------------
  -- 1. Same scene, same charged run, refund retried twice → ONE refund
  ------------------------------------------------------------------
  v_r  := public.composer_refund_scene_run(v_user, v_scene, v_run1, 4.50, 'failure');
  v_r2 := public.composer_refund_scene_run(v_user, v_scene, v_run1, 4.50, 'failure');
  v_key1 := v_r->>'refund_key';

  IF v_r->>'outcome' <> 'refunded' OR (v_r->>'amount_euros')::numeric <> 4.50 THEN
    RAISE EXCEPTION 'case1: first refund wrong: %', v_r;
  END IF;
  IF v_r2->>'outcome' <> 'already_refunded' OR (v_r2->>'amount_euros')::numeric <> 0 THEN
    RAISE EXCEPTION 'case1: retry must be a no-op: %', v_r2;
  END IF;
  IF v_key1 <> 'gen:' || v_scene::text || ':' || v_run1::text || ':failure' THEN
    RAISE EXCEPTION 'case1: key must contain scene AND run, got %', v_key1;
  END IF;
  SELECT count(*), COALESCE(sum(amount_euros),0) INTO v_count, v_sum
  FROM public.ai_video_transactions WHERE user_id = v_user AND type = 'refund';
  IF v_count <> 1 OR v_sum <> 4.50 THEN
    RAISE EXCEPTION 'case1: expected 1 refund / 4.50, got % / %', v_count, v_sum;
  END IF;

  ------------------------------------------------------------------
  -- 2. Same scene, second distinct charged run fails → SECOND refund allowed
  ------------------------------------------------------------------
  v_r := public.composer_refund_scene_run(v_user, v_scene, v_run2, 4.50, 'failure');
  v_key2 := v_r->>'refund_key';
  IF v_r->>'outcome' <> 'refunded' OR (v_r->>'amount_euros')::numeric <> 4.50 THEN
    RAISE EXCEPTION 'case2: second legitimate attempt must be refundable: %', v_r;
  END IF;
  IF v_key2 = v_key1 THEN RAISE EXCEPTION 'case2: keys of two runs must differ'; END IF;
  -- Retrying run #2 is again a no-op.
  v_r2 := public.composer_refund_scene_run(v_user, v_scene, v_run2, 4.50, 'failure');
  IF v_r2->>'outcome' <> 'already_refunded' THEN RAISE EXCEPTION 'case2: retry must be no-op: %', v_r2; END IF;

  SELECT count(*), COALESCE(sum(amount_euros),0) INTO v_count, v_sum
  FROM public.ai_video_transactions WHERE user_id = v_user AND type = 'refund';
  IF v_count <> 2 OR v_sum <> 9.00 THEN
    RAISE EXCEPTION 'case2: expected 2 refunds / 9.00, got % / %', v_count, v_sum;
  END IF;
  SELECT balance_euros INTO v_balance FROM public.ai_video_wallets WHERE user_id = v_user;
  IF v_balance <> 100.00 THEN RAISE EXCEPTION 'case2: balance must be back at 100.00, got %', v_balance; END IF;

  -- Each refund references its own charge and run.
  IF (SELECT count(DISTINCT metadata->>'bounded_charge_id') FROM public.ai_video_transactions
      WHERE user_id = v_user AND type = 'refund') <> 2 THEN
    RAISE EXCEPTION 'case2: refunds must be bound to two distinct charges';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ai_video_transactions
      WHERE user_id = v_user AND type = 'refund' AND metadata->>'run_id' = v_run2::text
        AND metadata->>'scene_id' = v_scene::text) THEN
    RAISE EXCEPTION 'case2: refund row must carry scene_id + run_id';
  END IF;

  ------------------------------------------------------------------
  -- 5. Bound by matching charge: a third "refund" for run #2 with a bigger
  --    amount and a different reason cannot exceed what is left (0.00).
  ------------------------------------------------------------------
  v_r := public.composer_refund_scene_run(v_user, v_scene, v_run2, 99.00, 'manual_recovery');
  IF v_r->>'outcome' <> 'charge_exhausted' OR (v_r->>'amount_euros')::numeric <> 0 THEN
    RAISE EXCEPTION 'case5: refund above the charge must be refused: %', v_r;
  END IF;
  SELECT balance_euros INTO v_balance FROM public.ai_video_wallets WHERE user_id = v_user;
  IF v_balance <> 100.00 THEN RAISE EXCEPTION 'case5: balance changed to %', v_balance; END IF;

  -- Partial refund is capped at the charge: a 3rd run charged 2.00, refund asks 5.00 → 2.00
  DECLARE v_run3 uuid := gen_random_uuid();
  BEGIN
    PERFORM public.v459_deduct_ai_video_credits(v_user, 2.00, v_scene,
      jsonb_build_object('scene_id', v_scene::text, 'run_id', v_run3::text));
    v_r := public.composer_refund_scene_run(v_user, v_scene, v_run3, 5.00, 'failure');
    IF v_r->>'outcome' <> 'refunded' OR (v_r->>'amount_euros')::numeric <> 2.00 THEN
      RAISE EXCEPTION 'case5b: refund must be capped at the 2.00 charge: %', v_r;
    END IF;
  END;

  ------------------------------------------------------------------
  -- 4. Legacy rows without run id → deterministic scene-level fallback,
  --    exactly one refund, never above the charge.
  ------------------------------------------------------------------
  -- Legacy-style charge: generation_id = scene, no run_id in metadata.
  PERFORM public.v459_deduct_ai_video_credits(v_user, 3.00, v_legacy_scene, '{}'::jsonb);
  v_r  := public.composer_refund_scene_run(v_user, v_legacy_scene, NULL, 3.00, 'failure');
  v_r2 := public.composer_refund_scene_run(v_user, v_legacy_scene, NULL, 3.00, 'failure');
  IF v_r->>'refund_key' <> 'gen:' || v_legacy_scene::text || ':failure' THEN
    RAISE EXCEPTION 'case4: legacy key must be the scene key, got %', v_r->>'refund_key';
  END IF;
  IF v_r->>'outcome' <> 'refunded' OR (v_r->>'amount_euros')::numeric <> 3.00 THEN
    RAISE EXCEPTION 'case4: legacy refund wrong: %', v_r;
  END IF;
  IF v_r2->>'outcome' <> 'already_refunded' THEN
    RAISE EXCEPTION 'case4: legacy retry must be no-op: %', v_r2;
  END IF;
  -- Backward compatibility: a pre-existing legacy refund row (old refund_ai_video_credits
  -- call with the scene key) blocks the new function from paying again.
  DECLARE v_old_scene uuid := gen_random_uuid();
  BEGIN
    PERFORM public.v459_deduct_ai_video_credits(v_user, 1.00, v_old_scene, '{}'::jsonb);
    PERFORM public.refund_ai_video_credits(v_user, 1.00, v_old_scene); -- legacy caller
    v_r := public.composer_refund_scene_run(v_user, v_old_scene, NULL, 1.00, 'failure');
    IF v_r->>'outcome' <> 'already_refunded' THEN
      RAISE EXCEPTION 'case4b: legacy ledger row must be honoured: %', v_r;
    END IF;
  END;

  ------------------------------------------------------------------
  -- 3. Concurrency: a competing caller that already inserted the refund_key
  --    row (race winner) → this call must not credit again. We simulate the
  --    loser by inserting the winner's row directly, bypassing the pre-check
  --    inside refund_ai_video_credits via the unique index path.
  ------------------------------------------------------------------
  DECLARE v_run4 uuid := gen_random_uuid();
  BEGIN
    PERFORM public.v459_deduct_ai_video_credits(v_user, 4.50, v_scene,
      jsonb_build_object('scene_id', v_scene::text, 'run_id', v_run4::text));
    SELECT balance_euros INTO v_balance FROM public.ai_video_wallets WHERE user_id = v_user;
    -- race winner (another connection) already wrote the refund row + credit
    UPDATE public.ai_video_wallets SET balance_euros = balance_euros + 4.50 WHERE user_id = v_user;
    INSERT INTO public.ai_video_transactions (user_id, currency, type, amount_euros, balance_after, generation_id, description, metadata)
    VALUES (v_user, 'EUR', 'refund', 4.50, v_balance + 4.50, v_scene, 'concurrent winner',
      jsonb_build_object('refund_key', 'gen:' || v_scene::text || ':' || v_run4::text || ':failure'));
    -- loser
    v_r := public.composer_refund_scene_run(v_user, v_scene, v_run4, 4.50, 'failure');
    IF v_r->>'outcome' <> 'already_refunded' OR (v_r->>'amount_euros')::numeric <> 0 THEN
      RAISE EXCEPTION 'case3: concurrent loser must not credit again: %', v_r;
    END IF;
    IF (SELECT balance_euros FROM public.ai_video_wallets WHERE user_id = v_user) <> v_balance + 4.50 THEN
      RAISE EXCEPTION 'case3: balance moved twice';
    END IF;
    -- The unique index itself refuses a second row with the same key.
    BEGIN
      INSERT INTO public.ai_video_transactions (user_id, currency, type, amount_euros, balance_after, generation_id, description, metadata)
      VALUES (v_user, 'EUR', 'refund', 4.50, 0, v_scene, 'dup',
        jsonb_build_object('refund_key', 'gen:' || v_scene::text || ':' || v_run4::text || ':failure'));
      RAISE EXCEPTION 'case3: unique refund_key index did not fire';
    EXCEPTION WHEN unique_violation THEN
      NULL; -- expected
    END;
  END;

  -- Final: no refund exceeds its bounded charge.
  IF EXISTS (
    SELECT 1 FROM public.ai_video_transactions r
    JOIN public.ai_video_transactions c ON c.id::text = r.metadata->>'bounded_charge_id'
    WHERE r.user_id = v_user AND r.type = 'refund'
    GROUP BY c.id, c.amount_euros HAVING sum(r.amount_euros) > abs(c.amount_euros)
  ) THEN
    RAISE EXCEPTION 'final: a charge was over-refunded';
  END IF;

  RAISE NOTICE 'composer refund key granularity: all checks passed';
END $$;

ROLLBACK;
