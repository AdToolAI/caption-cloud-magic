-- AI Video Wallets (separate from main credit system, Euro-based)
CREATE TABLE ai_video_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  
  -- Balance in Euro (not credits!)
  balance_euros NUMERIC(10, 2) DEFAULT 0.00 NOT NULL CHECK (balance_euros >= 0),
  
  -- Purchase History Tracking
  total_purchased_euros NUMERIC(10, 2) DEFAULT 0.00 NOT NULL,
  total_spent_euros NUMERIC(10, 2) DEFAULT 0.00 NOT NULL,
  
  -- Stripe Payment Method (for future One-Click-Kauf)
  stripe_payment_method_id TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- RLS Policies
ALTER TABLE ai_video_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ai video wallet"
  ON ai_video_wallets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage ai video wallets"
  ON ai_video_wallets FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- AI Video Transactions Log
CREATE TABLE ai_video_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  
  -- Transaction Type
  type TEXT NOT NULL CHECK (type IN ('purchase', 'deduction', 'refund', 'bonus')),
  
  -- Amounts in Euro
  amount_euros NUMERIC(10, 2) NOT NULL,
  balance_after NUMERIC(10, 2) NOT NULL,
  
  -- Purchase Details
  pack_size TEXT, -- 'starter', 'standard', 'pro', 'enterprise'
  bonus_percent INTEGER,
  
  -- Stripe Details
  stripe_payment_intent_id TEXT,
  stripe_checkout_session_id TEXT,
  
  -- Generation Reference (for deductions/refunds)
  generation_id UUID,
  
  -- Metadata
  description TEXT,
  metadata JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- RLS Policies
ALTER TABLE ai_video_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ai video transactions"
  ON ai_video_transactions FOR SELECT
  USING (auth.uid() = user_id);

-- AI Video Generations
CREATE TABLE ai_video_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  
  -- Generation Parameters
  prompt TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT 'sora-2',
  duration_seconds INTEGER NOT NULL CHECK (duration_seconds BETWEEN 5 AND 30),
  aspect_ratio TEXT NOT NULL DEFAULT '16:9',
  resolution TEXT NOT NULL DEFAULT '1080p',
  
  -- Cost Calculation
  cost_per_second NUMERIC(10, 2) NOT NULL DEFAULT 0.61,
  total_cost_euros NUMERIC(10, 2) NOT NULL,
  
  -- Artlist.io Job Tracking
  artlist_job_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' 
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'refunded')),
  
  -- Results
  video_url TEXT,
  thumbnail_url TEXT,
  storage_path TEXT,
  file_size_bytes BIGINT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  
  -- Error Handling
  error_message TEXT,
  retry_count INTEGER DEFAULT 0
);

-- RLS Policies
ALTER TABLE ai_video_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ai video generations"
  ON ai_video_generations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own ai video generations"
  ON ai_video_generations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_ai_video_wallets_user_id ON ai_video_wallets(user_id);
CREATE INDEX idx_ai_video_transactions_user_id ON ai_video_transactions(user_id);
CREATE INDEX idx_ai_video_transactions_generation_id ON ai_video_transactions(generation_id);
CREATE INDEX idx_ai_video_generations_user_id ON ai_video_generations(user_id);
CREATE INDEX idx_ai_video_generations_status ON ai_video_generations(status);
CREATE INDEX idx_ai_video_generations_created_at ON ai_video_generations(created_at DESC);

-- Database Function: Deduct AI Video Credits
CREATE OR REPLACE FUNCTION deduct_ai_video_credits(
  p_user_id UUID,
  p_amount_euros NUMERIC,
  p_generation_id UUID
) RETURNS TABLE(new_balance NUMERIC, success BOOLEAN) AS $$
DECLARE
  v_new_balance NUMERIC;
BEGIN
  -- Atomic deduction
  UPDATE ai_video_wallets
  SET 
    balance_euros = balance_euros - p_amount_euros,
    total_spent_euros = total_spent_euros + p_amount_euros,
    updated_at = NOW()
  WHERE user_id = p_user_id
    AND balance_euros >= p_amount_euros
  RETURNING balance_euros INTO v_new_balance;
  
  IF v_new_balance IS NOT NULL THEN
    -- Log transaction
    INSERT INTO ai_video_transactions (
      user_id, type, amount_euros, balance_after, generation_id, description
    ) VALUES (
      p_user_id, 'deduction', p_amount_euros, v_new_balance, p_generation_id,
      'AI video generation cost'
    );
    
    RETURN QUERY SELECT v_new_balance, TRUE;
  ELSE
    RETURN QUERY SELECT 0::NUMERIC, FALSE;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Database Function: Add AI Video Credits
CREATE OR REPLACE FUNCTION add_ai_video_credits(
  p_user_id UUID,
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
  
  -- Add to wallet or create if doesn't exist
  INSERT INTO ai_video_wallets (user_id, balance_euros, total_purchased_euros)
  VALUES (p_user_id, v_total_amount, p_base_amount)
  ON CONFLICT (user_id) 
  DO UPDATE SET
    balance_euros = ai_video_wallets.balance_euros + v_total_amount,
    total_purchased_euros = ai_video_wallets.total_purchased_euros + p_base_amount,
    updated_at = NOW()
  RETURNING balance_euros INTO v_new_balance;
  
  -- Log purchase transaction
  INSERT INTO ai_video_transactions (
    user_id, type, amount_euros, balance_after, pack_size, bonus_percent,
    stripe_checkout_session_id, description
  ) VALUES (
    p_user_id, 'purchase', p_base_amount, v_new_balance, p_pack_size, p_bonus_percent,
    p_stripe_session_id, 'AI Video Credits Purchase'
  );
  
  -- Log bonus transaction (if any)
  IF p_bonus_amount > 0 THEN
    INSERT INTO ai_video_transactions (
      user_id, type, amount_euros, balance_after, pack_size, bonus_percent, description
    ) VALUES (
      p_user_id, 'bonus', p_bonus_amount, v_new_balance, p_pack_size, p_bonus_percent,
      'Purchase bonus'
    );
  END IF;
  
  RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Database Function: Refund AI Video Credits
CREATE OR REPLACE FUNCTION refund_ai_video_credits(
  p_user_id UUID,
  p_amount_euros NUMERIC,
  p_generation_id UUID
) RETURNS NUMERIC AS $$
DECLARE
  v_new_balance NUMERIC;
BEGIN
  UPDATE ai_video_wallets
  SET 
    balance_euros = balance_euros + p_amount_euros,
    total_spent_euros = total_spent_euros - p_amount_euros,
    updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING balance_euros INTO v_new_balance;
  
  -- Log refund transaction
  INSERT INTO ai_video_transactions (
    user_id, type, amount_euros, balance_after, generation_id, description
  ) VALUES (
    p_user_id, 'refund', p_amount_euros, v_new_balance, p_generation_id,
    'AI video generation refund'
  );
  
  RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;