CREATE TABLE public.briefing_research_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  briefing_hash TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'de',
  mode TEXT,
  research JSONB NOT NULL DEFAULT '{}'::jsonb,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days')
);

CREATE UNIQUE INDEX briefing_research_cache_user_hash_lang_uq
  ON public.briefing_research_cache(user_id, briefing_hash, language);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.briefing_research_cache TO authenticated;
GRANT ALL ON public.briefing_research_cache TO service_role;

ALTER TABLE public.briefing_research_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read research cache"
  ON public.briefing_research_cache FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Owners insert research cache"
  ON public.briefing_research_cache FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Owners update research cache"
  ON public.briefing_research_cache FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Owners delete research cache"
  ON public.briefing_research_cache FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ─── Plan-vs-Storyboard drift reports ──────────────────────────────────────

CREATE TABLE public.composer_plan_drift_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.composer_projects(id) ON DELETE CASCADE,
  plan_version INTEGER,
  severity TEXT NOT NULL DEFAULT 'none',
  findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX composer_plan_drift_reports_project_created_idx
  ON public.composer_plan_drift_reports(project_id, created_at DESC);

GRANT SELECT, INSERT, DELETE ON public.composer_plan_drift_reports TO authenticated;
GRANT ALL ON public.composer_plan_drift_reports TO service_role;

ALTER TABLE public.composer_plan_drift_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read plan drift"
  ON public.composer_plan_drift_reports FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.composer_projects p
    WHERE p.id = composer_plan_drift_reports.project_id
      AND p.user_id = auth.uid()
  ));

CREATE POLICY "Owners insert plan drift"
  ON public.composer_plan_drift_reports FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.composer_projects p
    WHERE p.id = composer_plan_drift_reports.project_id
      AND p.user_id = auth.uid()
  ));

CREATE POLICY "Owners delete plan drift"
  ON public.composer_plan_drift_reports FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.composer_projects p
    WHERE p.id = composer_plan_drift_reports.project_id
      AND p.user_id = auth.uid()
  ));