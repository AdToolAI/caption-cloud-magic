
-- ============================================
-- PHASE 1: Trial + Activation columns
-- ============================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trial_status TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS account_paused BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS activation_emails_sent JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT now();

-- Constraint for trial_status values
DO $$ BEGIN
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_trial_status_check
    CHECK (trial_status IN ('active', 'expired', 'converted', 'cancelled'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Indexes for cron-job lookups
CREATE INDEX IF NOT EXISTS idx_profiles_trial_ends_at
  ON public.profiles(trial_ends_at)
  WHERE trial_status = 'active';

CREATE INDEX IF NOT EXISTS idx_profiles_account_paused
  ON public.profiles(account_paused)
  WHERE account_paused = true;

CREATE INDEX IF NOT EXISTS idx_profiles_created_at_activation
  ON public.profiles(created_at)
  WHERE trial_status = 'active';

-- ============================================
-- BACKFILL existing users (safety)
-- ============================================

-- Users with an active subscription/plan → converted (no trial gating)
UPDATE public.profiles p
SET trial_status = 'converted',
    account_paused = false
WHERE trial_status = 'active'
  AND (
    p.plan IN ('basic', 'pro', 'enterprise')
    OR p.stripe_customer_id IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM public.wallets w
      WHERE w.user_id = p.id
        AND w.plan_code IN ('basic', 'pro', 'enterprise')
    )
  );

-- All other existing users (Free) → expired but NOT paused (grandfathering)
UPDATE public.profiles
SET trial_status = 'expired',
    account_paused = false,
    trial_ends_at = created_at + INTERVAL '14 days'
WHERE trial_status = 'active'
  AND created_at < now() - INTERVAL '1 day';

-- Brand new users (created in last 24h) → start a fresh trial
UPDATE public.profiles
SET trial_status = 'active',
    trial_started_at = COALESCE(trial_started_at, created_at),
    trial_ends_at = COALESCE(trial_ends_at, created_at + INTERVAL '14 days')
WHERE trial_status = 'active'
  AND created_at >= now() - INTERVAL '1 day';

-- ============================================
-- UPDATED handle_new_user trigger
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (
    id, email, language,
    trial_status, trial_started_at, trial_ends_at,
    account_paused, last_active_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'language', 'en'),
    'active',
    now(),
    now() + INTERVAL '14 days',
    false,
    now()
  );
  RETURN NEW;
END;
$function$;

-- ============================================
-- UPDATED wallet trigger — Enterprise-Trial credits
-- ============================================

CREATE OR REPLACE FUNCTION public.create_wallet_for_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- New users start on Enterprise trial with 5000 credits
  INSERT INTO public.wallets (user_id, balance, plan_code, monthly_credits)
  VALUES (NEW.id, 5000, 'enterprise', 5000);

  RETURN NEW;
END;
$function$;
