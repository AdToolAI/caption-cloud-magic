-- ============================================================================
-- Phase 1: Credit System Foundation
-- Correct order: Enums → Tables → Indices → Functions → Policies → Seed Data
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status') THEN
        CREATE TYPE public.subscription_status AS ENUM ('active', 'paused', 'canceled');
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transaction_reason') THEN
        CREATE TYPE public.transaction_reason AS ENUM ('monthly_topup', 'addon', 'debit', 'refund', 'adjustment', 'overage');
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'usage_status') THEN
        CREATE TYPE public.usage_status AS ENUM ('success', 'failed', 'canceled');
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type') THEN
        CREATE TYPE public.notification_type AS ENUM ('low_balance', 'paused', 'threshold_hit');
    END IF;
END $$;

-- ============================================================================
-- TABLES
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'workspaces') THEN
        CREATE TABLE public.workspaces (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name TEXT NOT NULL,
          owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
          ai_paused BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        );
    ELSE
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'workspaces' AND column_name = 'owner_user_id') THEN
            ALTER TABLE public.workspaces ADD COLUMN owner_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'workspaces' AND column_name = 'ai_paused') THEN
            ALTER TABLE public.workspaces ADD COLUMN ai_paused BOOLEAN NOT NULL DEFAULT false;
        END IF;
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'workspaces' AND column_name = 'created_at') THEN
            ALTER TABLE public.workspaces ADD COLUMN created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now();
        END IF;
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'workspaces' AND column_name = 'updated_at') THEN
            ALTER TABLE public.workspaces ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now();
        END IF;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.billing_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  monthly_credits INTEGER NOT NULL DEFAULT 0,
  max_daily_generations INTEGER NOT NULL DEFAULT 100,
  max_concurrent_jobs INTEGER NOT NULL DEFAULT 5,
  seats_included INTEGER NOT NULL DEFAULT 1,
  overage_enabled BOOLEAN NOT NULL DEFAULT false,
  overage_price_per_credit NUMERIC(10,4) NOT NULL DEFAULT 0.01,
  features_json JSONB NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workspace_subscription (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.billing_plans(id),
  renew_day INTEGER NOT NULL DEFAULT 1 CHECK (renew_day >= 1 AND renew_day <= 28),
  status subscription_status NOT NULL DEFAULT 'active',
  overage_enabled BOOLEAN NOT NULL DEFAULT false,
  low_balance_threshold INTEGER NOT NULL DEFAULT 10,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(workspace_id)
);

CREATE TABLE IF NOT EXISTS public.wallet (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  balance_credits INTEGER NOT NULL DEFAULT 0 CHECK (balance_credits >= 0),
  last_top_up_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(workspace_id)
);

CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  reason transaction_reason NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cost_table (
  feature_code TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  unit_cost INTEGER NOT NULL CHECK (unit_cost > 0),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature_code TEXT NOT NULL,
  units INTEGER NOT NULL DEFAULT 1,
  credits INTEGER NOT NULL,
  status usage_status NOT NULL DEFAULT 'success',
  request_id TEXT,
  latency_ms INTEGER,
  meta JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.daily_quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  feature_code TEXT NOT NULL,
  used_units INTEGER NOT NULL DEFAULT 0,
  used_credits INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, user_id, date, feature_code)
);

CREATE TABLE IF NOT EXISTS public.seats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role team_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.addons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  credits INTEGER NOT NULL CHECK (credits > 0),
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.webhook_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ============================================================================
-- INDICES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_workspace_subscription_workspace ON public.workspace_subscription(workspace_id);
CREATE INDEX IF NOT EXISTS idx_wallet_workspace ON public.wallet(workspace_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_workspace_created ON public.credit_transactions(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_logs_workspace_created ON public.usage_logs(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_logs_feature ON public.usage_logs(feature_code);
CREATE INDEX IF NOT EXISTS idx_daily_quotas_workspace_date ON public.daily_quotas(workspace_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_seats_workspace ON public.seats(workspace_id);
CREATE INDEX IF NOT EXISTS idx_seats_user ON public.seats(user_id);

-- ============================================================================
-- SECURITY DEFINER FUNCTIONS (must exist before policies reference them)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.has_workspace_role(_workspace_id UUID, _user_id UUID, _role team_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.seats
    WHERE workspace_id = _workspace_id
      AND user_id = _user_id
      AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.get_workspace_role(_workspace_id UUID, _user_id UUID)
RETURNS team_role
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.seats
  WHERE workspace_id = _workspace_id
    AND user_id = _user_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_workspace_admin(_workspace_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.seats
    WHERE workspace_id = _workspace_id
      AND user_id = _user_id
      AND role IN ('owner', 'admin')
  );
$$;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_workspace_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS workspaces_updated_at ON public.workspaces;
CREATE TRIGGER workspaces_updated_at
  BEFORE UPDATE ON public.workspaces
  FOR EACH ROW
  EXECUTE FUNCTION public.update_workspace_updated_at();

CREATE OR REPLACE FUNCTION public.update_wallet_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS wallet_updated_at ON public.wallet;
CREATE TRIGGER wallet_updated_at
  BEFORE UPDATE ON public.wallet
  FOR EACH ROW
  EXECUTE FUNCTION public.update_wallet_updated_at();

-- ============================================================================
-- RLS POLICIES (after functions exist)
-- ============================================================================

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view workspaces they are members of" ON public.workspaces;
DROP POLICY IF EXISTS "Users can create workspaces" ON public.workspaces;
DROP POLICY IF EXISTS "Workspace owners can update workspaces" ON public.workspaces;
DROP POLICY IF EXISTS "Workspace owners can delete workspaces" ON public.workspaces;

CREATE POLICY "Users can view workspaces they are members of"
  ON public.workspaces FOR SELECT
  USING (public.is_workspace_member(id, auth.uid()));

CREATE POLICY "Users can create workspaces"
  ON public.workspaces FOR INSERT
  WITH CHECK (owner_user_id IS NOT NULL AND auth.uid() = owner_user_id);

CREATE POLICY "Workspace owners can update workspaces"
  ON public.workspaces FOR UPDATE
  USING (public.has_workspace_role(id, auth.uid(), 'owner'::team_role));

CREATE POLICY "Workspace owners can delete workspaces"
  ON public.workspaces FOR DELETE
  USING (public.has_workspace_role(id, auth.uid(), 'owner'::team_role));

ALTER TABLE public.billing_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view billing plans" ON public.billing_plans;
CREATE POLICY "Anyone can view billing plans"
  ON public.billing_plans FOR SELECT
  USING (true);

ALTER TABLE public.workspace_subscription ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members can view workspace subscription" ON public.workspace_subscription;
DROP POLICY IF EXISTS "Admins can update workspace subscription" ON public.workspace_subscription;

CREATE POLICY "Members can view workspace subscription"
  ON public.workspace_subscription FOR SELECT
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Admins can update workspace subscription"
  ON public.workspace_subscription FOR UPDATE
  USING (public.is_workspace_admin(workspace_id, auth.uid()));

ALTER TABLE public.wallet ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members can view workspace wallet" ON public.wallet;
CREATE POLICY "Members can view workspace wallet"
  ON public.wallet FOR SELECT
  USING (public.is_workspace_member(workspace_id, auth.uid()));

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members can view workspace transactions" ON public.credit_transactions;
CREATE POLICY "Members can view workspace transactions"
  ON public.credit_transactions FOR SELECT
  USING (public.is_workspace_member(workspace_id, auth.uid()));

ALTER TABLE public.cost_table ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view cost table" ON public.cost_table;
CREATE POLICY "Anyone can view cost table"
  ON public.cost_table FOR SELECT
  USING (true);

ALTER TABLE public.usage_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members can view workspace usage logs" ON public.usage_logs;
CREATE POLICY "Members can view workspace usage logs"
  ON public.usage_logs FOR SELECT
  USING (public.is_workspace_member(workspace_id, auth.uid()));

ALTER TABLE public.daily_quotas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members can view workspace quotas" ON public.daily_quotas;
CREATE POLICY "Members can view workspace quotas"
  ON public.daily_quotas FOR SELECT
  USING (public.is_workspace_member(workspace_id, auth.uid()));

ALTER TABLE public.seats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members can view workspace seats" ON public.seats;
DROP POLICY IF EXISTS "Admins can manage seats" ON public.seats;

CREATE POLICY "Members can view workspace seats"
  ON public.seats FOR SELECT
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Admins can manage seats"
  ON public.seats FOR ALL
  USING (public.is_workspace_admin(workspace_id, auth.uid()));

ALTER TABLE public.addons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view addons" ON public.addons;
CREATE POLICY "Anyone can view addons"
  ON public.addons FOR SELECT
  USING (true);

ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage webhooks" ON public.webhook_endpoints;
CREATE POLICY "Admins can manage webhooks"
  ON public.webhook_endpoints FOR ALL
  USING (public.is_workspace_admin(workspace_id, auth.uid()));

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members can view workspace notifications" ON public.notifications;
CREATE POLICY "Members can view workspace notifications"
  ON public.notifications FOR SELECT
  USING (public.is_workspace_member(workspace_id, auth.uid()));

-- ============================================================================
-- SEED DATA
-- ============================================================================

INSERT INTO public.billing_plans (code, name, monthly_credits, max_daily_generations, max_concurrent_jobs, seats_included, overage_enabled, overage_price_per_credit, features_json, sort_order) VALUES
('free', 'Free', 20, 10, 2, 1, false, 0.01, '{"watermark": true, "max_image_resolution": "1024x1024"}', 1),
('basic', 'Basic', 200, 50, 3, 2, true, 0.008, '{"watermark": false, "max_image_resolution": "2048x2048", "priority_support": false}', 2),
('pro', 'Pro', 1000, 200, 10, 5, true, 0.005, '{"watermark": false, "max_image_resolution": "4096x4096", "priority_support": true, "api_access": true}', 3)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.cost_table (feature_code, description, unit_cost) VALUES
('caption', 'Caption Generation', 1),
('comment', 'Comment Analysis', 1),
('bg_scene_variant', 'Background Scene Variant', 3),
('image_highres', 'High-Res Image Generation', 5),
('upscale_2x', '2x Image Upscaling', 1),
('carousel_slide', 'Carousel Slide Generation', 3),
('post_caption_bundle', 'Post + Caption Bundle', 2),
('hook', 'Hook Generation', 1),
('bio', 'Bio Generation', 2),
('reel_script', 'Reel Script Generation', 2),
('campaign', 'Campaign Generation', 5)
ON CONFLICT (feature_code) DO NOTHING;

INSERT INTO public.addons (code, name, credits, price_cents, sort_order) VALUES
('addon_50', '50 Credits Pack', 50, 499, 1),
('addon_100', '100 Credits Pack', 100, 899, 2),
('addon_250', '250 Credits Pack', 250, 1999, 3),
('addon_500', '500 Credits Mega Pack', 500, 3499, 4)
ON CONFLICT (code) DO NOTHING;