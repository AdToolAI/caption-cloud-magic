-- Extend ai_superuser_runs with motion-studio-specific metrics
ALTER TABLE public.ai_superuser_runs
  ADD COLUMN IF NOT EXISTS module text NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS render_url text,
  ADD COLUMN IF NOT EXISTS frames_rendered integer,
  ADD COLUMN IF NOT EXISTS credits_refunded numeric DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_ai_superuser_runs_module
  ON public.ai_superuser_runs(module, started_at DESC);

-- Add test-run marker to composer_projects so cleanup is deterministic
ALTER TABLE public.composer_projects
  ADD COLUMN IF NOT EXISTS is_test_run boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_composer_projects_is_test_run
  ON public.composer_projects(is_test_run, created_at DESC)
  WHERE is_test_run = true;