SELECT cron.unschedule('p1a_race_a');
SELECT cron.unschedule('p1a_race_b');

DO $test$
DECLARE
  v_user uuid := gen_random_uuid();
  v_run1 uuid := gen_random_uuid();
  v_run2 uuid := gen_random_uuid();
  v_project uuid := gen_random_uuid();
  v_legacy uuid; v_c1 uuid; v_c2 uuid;
  v_res jsonb; v_bal numeric; v_cnt int;
BEGIN
  INSERT INTO public.ai_video_wallets (user_id, balance_euros) VALUES (v_user, 0.00);
  INSERT INTO public.ai_video_transactions (user_id, type, amount_euros, balance_after, generation_id, description)
  VALUES (v_user, 'deduction', -6.30, 0.00, v_project, 'legacy project aggregate') RETURNING id INTO v_legacy;
  INSERT INTO public.ai_video_transactions (user_id, type, amount_euros, balance_after, generation_id, description)
  VALUES (v_user, 'deduction', -6.30, 0.00, v_run1, 'run1 charge') RETURNING id INTO v_c1;
  INSERT INTO public.ai_video_transactions (user_id, type, amount_euros, balance_after, generation_id, description)
  VALUES (v_user, 'deduction', -2.50, 0.00, v_run2, 'run2 charge') RETURNING id INTO v_c2;

  -- T1 no provenance -> no_charge, wallet untouched
  v_res := public.composer_refund_charge(v_legacy, v_run1, 'watchdog_stuck_clip');
  IF v_res->>'outcome' <> 'no_charge' THEN RAISE EXCEPTION 'T1 failed: %', v_res; END IF;
  SELECT balance_euros INTO v_bal FROM public.ai_video_wallets WHERE user_id = v_user;
  IF v_bal <> 0.00 THEN RAISE EXCEPTION 'T1 wallet changed: %', v_bal; END IF;

  -- T2 proven charge -> refunded with charge amount
  v_res := public.composer_refund_charge(v_c1, v_run1, 'watchdog_stuck_clip');
  IF v_res->>'outcome' <> 'refunded' OR (v_res->>'amount_euros')::numeric <> 6.30 THEN
    RAISE EXCEPTION 'T2 failed: %', v_res; END IF;
  SELECT balance_euros INTO v_bal FROM public.ai_video_wallets WHERE user_id = v_user;
  IF v_bal <> 6.30 THEN RAISE EXCEPTION 'T2 wallet wrong: %', v_bal; END IF;

  -- T3 second call with DIFFERENT reason -> already_refunded, no money
  v_res := public.composer_refund_charge(v_c1, v_run1, 'other_reason');
  IF v_res->>'outcome' <> 'already_refunded' OR (v_res->>'amount_euros')::numeric <> 0 THEN
    RAISE EXCEPTION 'T3 failed: %', v_res; END IF;
  SELECT balance_euros INTO v_bal FROM public.ai_video_wallets WHERE user_id = v_user;
  IF v_bal <> 6.30 THEN RAISE EXCEPTION 'T3 wallet changed: %', v_bal; END IF;
  SELECT count(*) INTO v_cnt FROM public.ai_video_transactions
    WHERE metadata->>'refund_charge_id' = v_c1::text;
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'T3 tx rows: %', v_cnt; END IF;

  -- T5 amount sourced from charge
  IF (SELECT amount_euros FROM public.ai_video_transactions
        WHERE type='refund' AND metadata->>'refund_charge_id' = v_c1::text) <> 6.30 THEN
    RAISE EXCEPTION 'T5 failed'; END IF;

  -- T6 run separation
  v_res := public.composer_refund_charge(v_c2, v_run1, 'watchdog_stuck_clip');
  IF v_res->>'outcome' <> 'no_charge' THEN RAISE EXCEPTION 'T6a failed: %', v_res; END IF;
  v_res := public.composer_refund_charge(v_c2, v_run2, 'watchdog_stuck_clip');
  IF v_res->>'outcome' <> 'refunded' OR (v_res->>'amount_euros')::numeric <> 2.50 THEN
    RAISE EXCEPTION 'T6b failed: %', v_res; END IF;
  SELECT balance_euros INTO v_bal FROM public.ai_video_wallets WHERE user_id = v_user;
  IF v_bal <> 8.80 THEN RAISE EXCEPTION 'T6 wallet wrong: %', v_bal; END IF;

  -- empty reason rejected, no financial effect
  BEGIN
    v_res := public.composer_refund_charge(v_c2, v_run2, '   ');
    RAISE EXCEPTION 'T0 failed: empty reason accepted';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE 'T0 failed%' THEN RAISE; END IF;
  END;

  DELETE FROM public.ai_video_transactions WHERE user_id = v_user;
  DELETE FROM public.ai_video_wallets WHERE user_id = v_user;
  RAISE NOTICE 'FA-4/P1-A T1,T2,T3,T5,T6 GREEN';
END;
$test$;

-- remove race fixtures + scratch tables
DELETE FROM public.ai_video_transactions t
 USING public._p1a_race_fixture f WHERE t.user_id = f.user_id;
DELETE FROM public.ai_video_wallets w
 USING public._p1a_race_fixture f WHERE w.user_id = f.user_id;
DROP TABLE public._p1a_race_log;
DROP TABLE public._p1a_race_fixture;