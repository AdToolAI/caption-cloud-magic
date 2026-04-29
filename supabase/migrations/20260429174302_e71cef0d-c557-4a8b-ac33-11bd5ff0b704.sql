
-- 1) BRIEFS — Master-Konfiguration pro Nutzer
CREATE TABLE public.autopilot_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Strategy
  topic_pillars text[] NOT NULL DEFAULT '{}',
  forbidden_topics text[] NOT NULL DEFAULT '{}',
  tonality text NOT NULL DEFAULT 'professional',
  platforms text[] NOT NULL DEFAULT '{}',
  posts_per_week jsonb NOT NULL DEFAULT '{}'::jsonb,
  languages text[] NOT NULL DEFAULT ARRAY['en'],
  avatar_ids uuid[] NOT NULL DEFAULT '{}',
  -- Budget & Mode
  weekly_credit_budget integer NOT NULL DEFAULT 1000,
  weekly_credits_spent integer NOT NULL DEFAULT 0,
  auto_publish_enabled boolean NOT NULL DEFAULT false,
  -- Status
  is_active boolean NOT NULL DEFAULT false,
  paused_until timestamptz,
  locked_until timestamptz,
  compliance_score integer NOT NULL DEFAULT 100 CHECK (compliance_score BETWEEN 0 AND 100),
  -- Lifecycle
  activated_at timestamptz,
  last_plan_generated_at timestamptz,
  budget_resets_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

CREATE INDEX idx_autopilot_briefs_active ON public.autopilot_briefs(is_active) WHERE is_active = true;

ALTER TABLE public.autopilot_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own brief"
  ON public.autopilot_briefs FOR SELECT
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users insert own brief"
  ON public.autopilot_briefs FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own brief"
  ON public.autopilot_briefs FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins can update any brief"
  ON public.autopilot_briefs FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_autopilot_briefs_updated_at
  BEFORE UPDATE ON public.autopilot_briefs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) QUEUE — Geplante Content-Slots
CREATE TABLE public.autopilot_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brief_id uuid NOT NULL REFERENCES public.autopilot_briefs(id) ON DELETE CASCADE,
  scheduled_at timestamptz NOT NULL,
  platform text NOT NULL,
  language text NOT NULL DEFAULT 'en',
  topic_hint text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','generating','qa_review','scheduled','posted','blocked','failed','skipped')),
  content_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  asset_url text,
  caption text,
  hashtags text[],
  qa_score integer CHECK (qa_score BETWEEN 0 AND 100),
  qa_findings jsonb,
  block_reason text,
  approved_by_user boolean DEFAULT false,
  approved_at timestamptz,
  posted_at timestamptz,
  social_post_id uuid,
  generation_cost_credits integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_autopilot_queue_user_scheduled ON public.autopilot_queue(user_id, scheduled_at);
CREATE INDEX idx_autopilot_queue_status_due ON public.autopilot_queue(status, scheduled_at)
  WHERE status IN ('scheduled','generating','qa_review');

ALTER TABLE public.autopilot_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own slots"
  ON public.autopilot_queue FOR SELECT
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users update own slots"
  ON public.autopilot_queue FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete own draft slots"
  ON public.autopilot_queue FOR DELETE
  USING (user_id = auth.uid() AND status IN ('draft','scheduled','qa_review'));

CREATE TRIGGER trg_autopilot_queue_updated_at
  BEFORE UPDATE ON public.autopilot_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) CONSENT LOG — Immutable Audit Trail
CREATE TABLE public.autopilot_consent_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL
    CHECK (event_type IN ('initial_activation','re_activation','aup_acceptance','auto_publish_enabled','reactivation_after_strike')),
  ip_hash text,
  user_agent text,
  accepted_text_hash text NOT NULL,
  accepted_text_version text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_autopilot_consent_user ON public.autopilot_consent_log(user_id, created_at DESC);

ALTER TABLE public.autopilot_consent_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own consents"
  ON public.autopilot_consent_log FOR SELECT
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));
-- No INSERT/UPDATE/DELETE policies → only via SECURITY DEFINER edge functions

-- 4) STRIKES — Sanktions-System
CREATE TABLE public.autopilot_strikes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  severity text NOT NULL CHECK (severity IN ('soft','hard','critical')),
  reason_code text NOT NULL,
  reason_description text NOT NULL,
  evidence_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  related_slot_id uuid REFERENCES public.autopilot_queue(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_autopilot_strikes_user_active ON public.autopilot_strikes(user_id, is_active, severity);

ALTER TABLE public.autopilot_strikes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own strikes"
  ON public.autopilot_strikes FOR SELECT
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));
-- No INSERT/UPDATE/DELETE policies → only via SECURITY DEFINER edge functions

-- 5) ACTIVITY LOG — EU AI Act Audit
CREATE TABLE public.autopilot_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor text NOT NULL DEFAULT 'autopilot_ai'
    CHECK (actor IN ('autopilot_ai','user','admin','system','qa_gate','prompt_shield','caption_shield','publisher')),
  slot_id uuid REFERENCES public.autopilot_queue(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_autopilot_activity_user_time ON public.autopilot_activity_log(user_id, created_at DESC);
CREATE INDEX idx_autopilot_activity_type ON public.autopilot_activity_log(event_type, created_at DESC);

ALTER TABLE public.autopilot_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own activity"
  ON public.autopilot_activity_log FOR SELECT
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));
-- No INSERT/UPDATE/DELETE policies → only via SECURITY DEFINER edge functions

-- 6) TERMINATED ACCOUNTS ARCHIVE — Beweissicherung 90d
CREATE TABLE public.terminated_accounts_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_user_id uuid NOT NULL,
  email text,
  termination_reason text NOT NULL,
  evidence_json jsonb NOT NULL,
  strikes_snapshot jsonb,
  consent_snapshot jsonb,
  terminated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  terminated_at timestamptz NOT NULL DEFAULT now(),
  hard_delete_at timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
  appeal_received_at timestamptz,
  appeal_outcome text
);

CREATE INDEX idx_terminated_archive_delete ON public.terminated_accounts_archive(hard_delete_at);

ALTER TABLE public.terminated_accounts_archive ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins access termination archive"
  ON public.terminated_accounts_archive FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 7) Add termination columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS terminated_at timestamptz,
  ADD COLUMN IF NOT EXISTS terminated_reason text,
  ADD COLUMN IF NOT EXISTS autopilot_permanently_locked boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_terminated ON public.profiles(terminated_at) WHERE terminated_at IS NOT NULL;
