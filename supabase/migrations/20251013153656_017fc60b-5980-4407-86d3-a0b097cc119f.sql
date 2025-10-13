-- Create wallets table to track user credit balances
CREATE TABLE IF NOT EXISTS public.wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  balance INTEGER NOT NULL DEFAULT 0,
  plan_code TEXT NOT NULL DEFAULT 'free',
  monthly_credits INTEGER NOT NULL DEFAULT 100,
  last_reset_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on wallets
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

-- Users can view their own wallet
CREATE POLICY "Users can view own wallet"
  ON public.wallets FOR SELECT
  USING (auth.uid() = user_id);

-- Trigger for updated_at on wallets
CREATE TRIGGER update_wallets_updated_at
  BEFORE UPDATE ON public.wallets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create feature_costs table to define credit costs per feature
CREATE TABLE IF NOT EXISTS public.feature_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_code TEXT UNIQUE NOT NULL,
  credits_per_use INTEGER NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on feature_costs
ALTER TABLE public.feature_costs ENABLE ROW LEVEL SECURITY;

-- Anyone can view feature costs (public)
CREATE POLICY "Anyone can view feature costs"
  ON public.feature_costs FOR SELECT
  USING (true);

-- Create credit_reservations table for reserve-commit-refund flow
CREATE TABLE IF NOT EXISTS public.credit_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  feature_code TEXT NOT NULL,
  reserved_amount INTEGER NOT NULL,
  actual_amount INTEGER,
  status TEXT NOT NULL DEFAULT 'reserved',
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + INTERVAL '5 minutes'),
  committed_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on credit_reservations
ALTER TABLE public.credit_reservations ENABLE ROW LEVEL SECURITY;

-- Users can view their own reservations
CREATE POLICY "Users can view own reservations"
  ON public.credit_reservations FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can create reservations
CREATE POLICY "Service can create reservations"
  ON public.credit_reservations FOR INSERT
  WITH CHECK (true);

-- Service role can update reservations
CREATE POLICY "Service can update reservations"
  ON public.credit_reservations FOR UPDATE
  USING (true);

-- Insert initial feature costs data
INSERT INTO public.feature_costs (feature_code, credits_per_use, description) VALUES
  ('caption_generate', 1, 'AI Caption Generation'),
  ('hashtag_analyze', 1, 'Hashtag Analysis'),
  ('bio_optimize', 2, 'Bio Optimization'),
  ('background_generate', 1, 'Background Generation (per variant)'),
  ('coach_chat', 1, 'Coach Chat Message'),
  ('post_schedule', 0, 'Post Scheduling (free)'),
  ('trend_fetch', 3, 'Trend Fetching'),
  ('image_process', 2, 'Image Processing'),
  ('comment_analyze', 1, 'Comment Analysis')
ON CONFLICT (feature_code) DO NOTHING;

-- Function to create wallet for new users
CREATE OR REPLACE FUNCTION public.create_wallet_for_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_monthly_credits INTEGER;
BEGIN
  -- Default to free plan with 100 credits
  user_monthly_credits := 100;

  -- Create wallet with free plan
  INSERT INTO public.wallets (user_id, balance, plan_code, monthly_credits)
  VALUES (NEW.id, user_monthly_credits, 'free', user_monthly_credits);

  RETURN NEW;
END;
$$;

-- Trigger to create wallet on user signup
CREATE TRIGGER on_auth_user_created_create_wallet
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.create_wallet_for_new_user();

-- Function for monthly credit reset
CREATE OR REPLACE FUNCTION public.reset_monthly_credits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.wallets
  SET 
    balance = monthly_credits,
    last_reset_at = now(),
    updated_at = now()
  WHERE 
    last_reset_at < date_trunc('month', now());
END;
$$;