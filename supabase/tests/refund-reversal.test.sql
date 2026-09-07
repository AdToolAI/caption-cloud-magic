-- Contract tests for public.stripe_revoke_ai_video_credits_for_refund
-- Run standalone; all fixtures are synthetic and removed at the end.

CREATE TEMP TABLE IF NOT EXISTS t_results(case_name text, ok boolean, detail text);

DO $$
DECLARE
  u uuid;
  r jsonb;
  bal numeric;
  cnt int;
  s text;
BEGIN
  -- helper-less inline fixtures; each case uses its own synthetic user + session

  ---------------------------------------------------------------- C1 full refund, unused
  u := gen_random_uuid(); s := 'cs_test_c1';
  INSERT INTO ai_video_wallets(user_id, balance_euros, total_purchased_euros, total_spent_euros, currency)
  VALUES (u, 106, 106, 0, 'EUR');
  INSERT INTO ai_video_transactions(user_id, currency, type, amount_euros, balance_after, stripe_checkout_session_id)
  VALUES (u,'EUR','purchase',100,100,s),(u,'EUR','bonus',6,106,s);
  r := stripe_revoke_ai_video_credits_for_refund(s,'re_c1',10000,10000);
  SELECT balance_euros INTO bal FROM ai_video_wallets WHERE user_id=u;
  INSERT INTO t_results VALUES ('C1 full refund incl. bonus',
    (r->>'reversed')::bool AND (r->>'reversed_euros')::numeric = 106 AND bal = 0,
    r::text || ' balance=' || bal);

  ---------------------------------------------------------------- C2 partial refund
  u := gen_random_uuid(); s := 'cs_test_c2';
  INSERT INTO ai_video_wallets(user_id, balance_euros, total_purchased_euros, total_spent_euros, currency)
  VALUES (u, 106, 106, 0, 'EUR');
  INSERT INTO ai_video_transactions(user_id, currency, type, amount_euros, balance_after, stripe_checkout_session_id)
  VALUES (u,'EUR','purchase',100,100,s),(u,'EUR','bonus',6,106,s);
  r := stripe_revoke_ai_video_credits_for_refund(s,'re_c2',2000,10000);
  SELECT balance_euros INTO bal FROM ai_video_wallets WHERE user_id=u;
  INSERT INTO t_results VALUES ('C2 partial refund 20%',
    (r->>'reversed_euros')::numeric = 21.2 AND bal = 84.8, r::text || ' balance=' || bal);

  ---------------------------------------------------------------- C3 refund after spending
  u := gen_random_uuid(); s := 'cs_test_c3';
  INSERT INTO ai_video_wallets(user_id, balance_euros, total_purchased_euros, total_spent_euros, currency)
  VALUES (u, 30, 106, 76, 'EUR');
  INSERT INTO ai_video_transactions(user_id, currency, type, amount_euros, balance_after, stripe_checkout_session_id)
  VALUES (u,'EUR','purchase',100,100,s),(u,'EUR','bonus',6,106,s),(u,'EUR','deduction',-76,30,NULL);
  r := stripe_revoke_ai_video_credits_for_refund(s,'re_c3',10000,10000);
  SELECT balance_euros INTO bal FROM ai_video_wallets WHERE user_id=u;
  INSERT INTO t_results VALUES ('C3 refund after spend, no negative balance',
    (r->>'reversed_euros')::numeric = 30 AND (r->>'unrecovered_euros')::numeric = 76 AND bal = 0,
    r::text || ' balance=' || bal);

  ---------------------------------------------------------------- C4 duplicate event
  u := gen_random_uuid(); s := 'cs_test_c4';
  INSERT INTO ai_video_wallets(user_id, balance_euros, total_purchased_euros, total_spent_euros, currency)
  VALUES (u, 51, 51, 0, 'EUR');
  INSERT INTO ai_video_transactions(user_id, currency, type, amount_euros, balance_after, stripe_checkout_session_id)
  VALUES (u,'EUR','purchase',50,50,s),(u,'EUR','bonus',1,51,s);
  PERFORM stripe_revoke_ai_video_credits_for_refund(s,'re_c4',5000,5000);
  r := stripe_revoke_ai_video_credits_for_refund(s,'re_c4',5000,5000);
  SELECT balance_euros INTO bal FROM ai_video_wallets WHERE user_id=u;
  SELECT count(*) INTO cnt FROM ai_video_transactions WHERE user_id=u AND type='refund';
  INSERT INTO t_results VALUES ('C4 duplicate charge.refunded is idempotent',
    r->>'reason' = 'already_reversed' AND cnt = 1 AND bal = 0, r::text || ' refunds=' || cnt || ' balance=' || bal);

  ---------------------------------------------------------------- C5 two partial refunds, cumulative
  u := gen_random_uuid(); s := 'cs_test_c5';
  INSERT INTO ai_video_wallets(user_id, balance_euros, total_purchased_euros, total_spent_euros, currency)
  VALUES (u, 106, 106, 0, 'EUR');
  INSERT INTO ai_video_transactions(user_id, currency, type, amount_euros, balance_after, stripe_checkout_session_id)
  VALUES (u,'EUR','purchase',100,100,s),(u,'EUR','bonus',6,106,s);
  r := stripe_revoke_ai_video_credits_for_refund(s,'re_c5a',2000,10000);          -- 20 EUR
  r := stripe_revoke_ai_video_credits_for_refund(s,'re_c5b',5000,10000);          -- cumulative 50 EUR
  SELECT balance_euros INTO bal FROM ai_video_wallets WHERE user_id=u;
  INSERT INTO t_results VALUES ('C5 two partial refunds use cumulative base (21.2 + 31.8 = 53)',
    (r->>'reversed_euros')::numeric = 31.8 AND bal = 53, r::text || ' balance=' || bal);

  ---------------------------------------------------------------- C6 refund larger than balance
  u := gen_random_uuid(); s := 'cs_test_c6';
  INSERT INTO ai_video_wallets(user_id, balance_euros, total_purchased_euros, total_spent_euros, currency)
  VALUES (u, 5, 106, 101, 'EUR');
  INSERT INTO ai_video_transactions(user_id, currency, type, amount_euros, balance_after, stripe_checkout_session_id)
  VALUES (u,'EUR','purchase',100,100,s),(u,'EUR','bonus',6,106,s);
  r := stripe_revoke_ai_video_credits_for_refund(s,'re_c6',10000,10000);
  SELECT balance_euros INTO bal FROM ai_video_wallets WHERE user_id=u;
  INSERT INTO t_results VALUES ('C6 refund larger than balance clamps at 0',
    (r->>'reversed_euros')::numeric = 5 AND bal = 0 AND (r->>'unrecovered_euros')::numeric = 101,
    r::text || ' balance=' || bal);

  ---------------------------------------------------------------- C7 subscription payment (no credit purchase)
  u := gen_random_uuid(); s := 'cs_test_c7_sub';
  INSERT INTO ai_video_wallets(user_id, balance_euros, total_purchased_euros, total_spent_euros, currency)
  VALUES (u, 20, 20, 0, 'EUR');
  r := stripe_revoke_ai_video_credits_for_refund(s,'re_c7',1495,1495);
  SELECT balance_euros INTO bal FROM ai_video_wallets WHERE user_id=u;
  INSERT INTO t_results VALUES ('C7 subscription refund leaves wallet untouched',
    r->>'reason' = 'no_purchase_found' AND bal = 20, r::text || ' balance=' || bal);

  ---------------------------------------------------------------- C8 founder-discounted purchase
  u := gen_random_uuid(); s := 'cs_test_c8';
  INSERT INTO ai_video_wallets(user_id, balance_euros, total_purchased_euros, total_spent_euros, currency)
  VALUES (u, 9, 9, 0, 'EUR');
  INSERT INTO ai_video_transactions(user_id, currency, type, amount_euros, balance_after, stripe_checkout_session_id)
  VALUES (u,'EUR','purchase',9,9,s);
  r := stripe_revoke_ai_video_credits_for_refund(s,'re_c8',800,800);   -- paid 8.00 after 20% founder discount
  SELECT balance_euros INTO bal FROM ai_video_wallets WHERE user_id=u;
  INSERT INTO t_results VALUES ('C8 founder-discounted purchase revokes granted credits, not paid amount',
    (r->>'reversed_euros')::numeric = 9 AND bal = 0, r::text || ' balance=' || bal);

  ---------------------------------------------------------------- C9 bonus pack partial, ledger reference
  u := gen_random_uuid(); s := 'cs_test_c9';
  INSERT INTO ai_video_wallets(user_id, balance_euros, total_purchased_euros, total_spent_euros, currency)
  VALUES (u, 287.5, 287.5, 0, 'EUR');
  INSERT INTO ai_video_transactions(user_id, currency, type, amount_euros, balance_after, stripe_checkout_session_id)
  VALUES (u,'EUR','purchase',250,250,s),(u,'EUR','bonus',37.5,287.5,s);
  r := stripe_revoke_ai_video_credits_for_refund(s,'re_c9',12500,25000);
  SELECT count(*) INTO cnt FROM ai_video_transactions
   WHERE user_id=u AND type='refund' AND stripe_checkout_session_id=s
     AND metadata->>'stripe_refund_id'='re_c9' AND amount_euros = -143.75;
  INSERT INTO t_results VALUES ('C9 bonus pack 50% refund = 143.75, ledger row references refund + session',
    (r->>'reversed_euros')::numeric = 143.75 AND cnt = 1, r::text);

  ---------------------------------------------------------------- C10 same payment, second webhook event, same cumulative total
  u := gen_random_uuid(); s := 'cs_test_c10';
  INSERT INTO ai_video_wallets(user_id, balance_euros, total_purchased_euros, total_spent_euros, currency)
  VALUES (u, 106, 106, 0, 'EUR');
  INSERT INTO ai_video_transactions(user_id, currency, type, amount_euros, balance_after, stripe_checkout_session_id)
  VALUES (u,'EUR','purchase',100,100,s),(u,'EUR','bonus',6,106,s);
  PERFORM stripe_revoke_ai_video_credits_for_refund(s,'re_c10',3000,10000);      -- charge.refunded
  r := stripe_revoke_ai_video_credits_for_refund(s,'re_c10_alt',3000,10000);     -- charge.refund.updated, same total
  SELECT balance_euros INTO bal FROM ai_video_wallets WHERE user_id=u;
  SELECT count(*) INTO cnt FROM ai_video_transactions WHERE user_id=u AND type='refund' AND amount_euros < 0;
  INSERT INTO t_results VALUES ('C10 second event for already-covered amount debits nothing',
    r->>'reason' = 'nothing_outstanding' AND bal = 74.2 AND cnt = 1, r::text || ' balance=' || bal);

  -- cleanup
  DELETE FROM ai_video_transactions WHERE stripe_checkout_session_id LIKE 'cs_test_c%';
  DELETE FROM ai_video_wallets w WHERE NOT EXISTS (
    SELECT 1 FROM ai_video_transactions t WHERE t.user_id = w.user_id
  ) AND w.created_at > now() - interval '5 minutes';
END $$;

SELECT case_name, ok, detail FROM t_results ORDER BY case_name;
