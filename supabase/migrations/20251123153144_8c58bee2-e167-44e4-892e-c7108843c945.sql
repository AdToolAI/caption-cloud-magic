-- Idempotenz-Schutz: Verhindere Doppelverarbeitung von Stripe Sessions
CREATE OR REPLACE FUNCTION public.add_ai_video_credits(
  p_user_id uuid, 
  p_currency text, 
  p_base_amount numeric, 
  p_bonus_amount numeric, 
  p_pack_size text, 
  p_bonus_percent integer, 
  p_stripe_session_id text
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_amount NUMERIC;
  v_new_balance NUMERIC;
  v_existing_balance NUMERIC;
BEGIN
  -- ✅ DUPLIKAT-CHECK: Prüfe ob Session bereits verarbeitet wurde
  SELECT balance_after INTO v_existing_balance
  FROM ai_video_transactions
  WHERE stripe_checkout_session_id = p_stripe_session_id
    AND type = 'purchase'
  LIMIT 1;
  
  -- Falls bereits verarbeitet, gib existierende Balance zurück (idempotent)
  IF v_existing_balance IS NOT NULL THEN
    RAISE NOTICE 'Session % already processed, returning existing balance %', p_stripe_session_id, v_existing_balance;
    RETURN v_existing_balance;
  END IF;
  
  -- Normal weiter: Credits hinzufügen
  v_total_amount := p_base_amount + p_bonus_amount;
  
  INSERT INTO ai_video_wallets (user_id, currency, balance_euros, total_purchased_euros)
  VALUES (p_user_id, p_currency, v_total_amount, p_base_amount)
  ON CONFLICT (user_id) 
  DO UPDATE SET
    balance_euros = ai_video_wallets.balance_euros + v_total_amount,
    total_purchased_euros = ai_video_wallets.total_purchased_euros + p_base_amount,
    currency = p_currency,
    updated_at = NOW()
  RETURNING balance_euros INTO v_new_balance;
  
  -- Log purchase transaction
  INSERT INTO ai_video_transactions (
    user_id, currency, type, amount_euros, balance_after, 
    pack_size, bonus_percent, stripe_checkout_session_id, description
  ) VALUES (
    p_user_id, p_currency, 'purchase', p_base_amount, v_new_balance, 
    p_pack_size, p_bonus_percent, p_stripe_session_id, 'AI Video Credits Purchase'
  );
  
  -- Log bonus if applicable
  IF p_bonus_amount > 0 THEN
    INSERT INTO ai_video_transactions (
      user_id, currency, type, amount_euros, balance_after, 
      pack_size, bonus_percent, description
    ) VALUES (
      p_user_id, p_currency, 'bonus', p_bonus_amount, v_new_balance,
      p_pack_size, p_bonus_percent, 'Purchase bonus'
    );
  END IF;
  
  RETURN v_new_balance;
END;
$$;