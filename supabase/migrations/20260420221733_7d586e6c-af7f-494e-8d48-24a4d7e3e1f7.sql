
-- ============================================
-- BUG REPORTS TABLE
-- ============================================
CREATE TABLE public.bug_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'wont_fix', 'duplicate')),
  route TEXT,
  user_agent TEXT,
  viewport TEXT,
  screenshot_url TEXT,
  console_logs JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  admin_notes TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bug_reports_status ON public.bug_reports(status);
CREATE INDEX idx_bug_reports_user_id ON public.bug_reports(user_id);
CREATE INDEX idx_bug_reports_created_at ON public.bug_reports(created_at DESC);

ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create bug reports"
ON public.bug_reports FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can view their own bug reports"
ON public.bug_reports FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all bug reports"
ON public.bug_reports FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update bug reports"
ON public.bug_reports FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete bug reports"
ON public.bug_reports FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_bug_reports_updated_at
BEFORE UPDATE ON public.bug_reports
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- SMOKE TEST RUNS TABLE
-- ============================================
CREATE TABLE public.smoke_test_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_name TEXT NOT NULL,
  test_type TEXT NOT NULL DEFAULT 'edge_function',
  status TEXT NOT NULL CHECK (status IN ('pass', 'fail', 'skip', 'timeout')),
  latency_ms INTEGER,
  error_message TEXT,
  response_data JSONB,
  metadata JSONB DEFAULT '{}'::jsonb,
  run_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_smoke_test_runs_test_name ON public.smoke_test_runs(test_name);
CREATE INDEX idx_smoke_test_runs_status ON public.smoke_test_runs(status);
CREATE INDEX idx_smoke_test_runs_run_at ON public.smoke_test_runs(run_at DESC);

ALTER TABLE public.smoke_test_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view smoke test runs"
ON public.smoke_test_runs FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can insert smoke test runs"
ON public.smoke_test_runs FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- ============================================
-- SENTRY ISSUES CACHE TABLE
-- ============================================
CREATE TABLE public.sentry_issues_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sentry_issue_id TEXT NOT NULL UNIQUE,
  short_id TEXT,
  title TEXT NOT NULL,
  culprit TEXT,
  level TEXT,
  status TEXT,
  platform TEXT,
  event_count INTEGER DEFAULT 0,
  user_count INTEGER DEFAULT 0,
  first_seen TIMESTAMPTZ,
  last_seen TIMESTAMPTZ,
  permalink TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sentry_issues_last_seen ON public.sentry_issues_cache(last_seen DESC);
CREATE INDEX idx_sentry_issues_level ON public.sentry_issues_cache(level);
CREATE INDEX idx_sentry_issues_status ON public.sentry_issues_cache(status);

ALTER TABLE public.sentry_issues_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view sentry issues"
ON public.sentry_issues_cache FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage sentry issues cache"
ON public.sentry_issues_cache FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- ============================================
-- STORAGE BUCKET FOR BUG SCREENSHOTS
-- ============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('bug-screenshots', 'bug-screenshots', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload bug screenshots"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'bug-screenshots');

CREATE POLICY "Anyone can view bug screenshots"
ON storage.objects FOR SELECT
TO authenticated, anon
USING (bucket_id = 'bug-screenshots');

CREATE POLICY "Admins can delete bug screenshots"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'bug-screenshots' AND public.has_role(auth.uid(), 'admin'::app_role));
