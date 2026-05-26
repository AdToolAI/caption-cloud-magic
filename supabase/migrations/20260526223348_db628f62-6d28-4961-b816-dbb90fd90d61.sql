
-- Add scheduling fields to campaigns
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS pauses_strategy boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_campaigns_user_dates ON public.campaigns(user_id, starts_at, ends_at);

-- Strategy mode pauses (campaign overrides)
CREATE TABLE IF NOT EXISTS public.strategy_mode_pauses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  reason text NOT NULL DEFAULT 'campaign_override',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.strategy_mode_pauses TO authenticated;
GRANT ALL ON public.strategy_mode_pauses TO service_role;

ALTER TABLE public.strategy_mode_pauses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own strategy pauses"
  ON public.strategy_mode_pauses FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users insert own strategy pauses"
  ON public.strategy_mode_pauses FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own strategy pauses"
  ON public.strategy_mode_pauses FOR UPDATE
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users delete own strategy pauses"
  ON public.strategy_mode_pauses FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_strategy_pauses_user_range
  ON public.strategy_mode_pauses(user_id, starts_at, ends_at);

-- Strategy seeds derived from campaign performance
CREATE TABLE IF NOT EXISTS public.strategy_seeds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source_campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  insights jsonb NOT NULL DEFAULT '{}'::jsonb,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.strategy_seeds TO authenticated;
GRANT ALL ON public.strategy_seeds TO service_role;

ALTER TABLE public.strategy_seeds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own strategy seeds"
  ON public.strategy_seeds FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users insert own strategy seeds"
  ON public.strategy_seeds FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own strategy seeds"
  ON public.strategy_seeds FOR UPDATE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_strategy_seeds_user_unconsumed
  ON public.strategy_seeds(user_id, consumed_at);
