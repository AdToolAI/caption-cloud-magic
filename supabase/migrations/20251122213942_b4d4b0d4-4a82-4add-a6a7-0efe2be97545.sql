
-- Add currency support to AI Video system

-- Add currency column to ai_video_wallets
ALTER TABLE ai_video_wallets 
ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'EUR' CHECK (currency IN ('EUR', 'USD'));

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_ai_video_wallets_currency ON ai_video_wallets(currency);

-- Add currency column to ai_video_transactions
ALTER TABLE ai_video_transactions
ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'EUR' CHECK (currency IN ('EUR', 'USD'));

-- Drop and recreate add_ai_video_credits function with currency support
DROP FUNCTION IF EXISTS add_ai_video_credits(uuid, numeric, numeric, text, integer, text);

CREATE OR REPLACE FUNCTION add_ai_video_credits(
  p_user_id UUID,
  p_currency TEXT,
  p_base_amount NUMERIC,
  p_bonus_amount NUMERIC,
  p_pack_size TEXT,
  p_bonus_percent INTEGER,
  p_stripe_session_id TEXT
) RETURNS NUMERIC AS $$
DECLARE
  v_total_amount NUMERIC;
  v_new_balance NUMERIC;
BEGIN
  v_total_amount := p_base_amount + p_bonus_amount;
  
  -- Create or update wallet with currency
  INSERT INTO ai_video_wallets (user_id, currency, balance_euros, total_purchased_euros)
  VALUES (p_user_id, p_currency, v_total_amount, p_base_amount)
  ON CONFLICT (user_id) 
  DO UPDATE SET
    balance_euros = ai_video_wallets.balance_euros + v_total_amount,
    total_purchased_euros = ai_video_wallets.total_purchased_euros + p_base_amount,
    currency = p_currency,
    updated_at = NOW()
  RETURNING balance_euros INTO v_new_balance;
  
  -- Log purchase transaction with currency
  INSERT INTO ai_video_transactions (
    user_id, currency, type, amount_euros, balance_after, 
    pack_size, bonus_percent, stripe_checkout_session_id, description
  ) VALUES (
    p_user_id, p_currency, 'purchase', p_base_amount, v_new_balance, 
    p_pack_size, p_bonus_percent, p_stripe_session_id, 'AI Video Credits Purchase'
  );
  
  -- Log bonus transaction if applicable
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop and recreate deduct_ai_video_credits function with currency support
DROP FUNCTION IF EXISTS deduct_ai_video_credits(uuid, numeric, uuid);

CREATE OR REPLACE FUNCTION deduct_ai_video_credits(
  p_user_id UUID,
  p_amount NUMERIC,
  p_generation_id UUID
) RETURNS NUMERIC AS $$
DECLARE
  v_current_balance NUMERIC;
  v_new_balance NUMERIC;
  v_currency TEXT;
BEGIN
  -- Get current balance and currency
  SELECT balance_euros, currency INTO v_current_balance, v_currency
  FROM ai_video_wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found for user';
  END IF;

  IF v_current_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient credits';
  END IF;

  -- Deduct credits
  UPDATE ai_video_wallets
  SET 
    balance_euros = balance_euros - p_amount,
    total_spent_euros = total_spent_euros + p_amount,
    updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING balance_euros INTO v_new_balance;

  -- Log transaction with currency
  INSERT INTO ai_video_transactions (
    user_id, currency, type, amount_euros, balance_after, generation_id, description
  ) VALUES (
    p_user_id, v_currency, 'deduction', -p_amount, v_new_balance, p_generation_id, 'Video generation cost'
  );

  RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop and recreate refund_ai_video_credits function with currency support
DROP FUNCTION IF EXISTS refund_ai_video_credits(uuid, numeric, uuid);

CREATE OR REPLACE FUNCTION refund_ai_video_credits(
  p_user_id UUID,
  p_amount_euros NUMERIC,
  p_generation_id UUID
) RETURNS NUMERIC AS $$
DECLARE
  v_new_balance NUMERIC;
  v_currency TEXT;
BEGIN
  -- Get currency from wallet
  SELECT currency INTO v_currency
  FROM ai_video_wallets
  WHERE user_id = p_user_id;
  
  IF NOT FOUND THEN
    v_currency := 'EUR'; -- Default fallback
  END IF;
  
  UPDATE ai_video_wallets
  SET 
    balance_euros = balance_euros + p_amount_euros,
    total_spent_euros = total_spent_euros - p_amount_euros,
    updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING balance_euros INTO v_new_balance;
  
  -- Log refund transaction with currency
  INSERT INTO ai_video_transactions (
    user_id, currency, type, amount_euros, balance_after, generation_id, description
  ) VALUES (
    p_user_id, v_currency, 'refund', p_amount_euros, v_new_balance, p_generation_id,
    'AI video generation refund'
  );
  
  RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
