ALTER TABLE public.composer_projects
  ADD COLUMN IF NOT EXISTS ad_framework TEXT,
  ADD COLUMN IF NOT EXISTS ad_tonality TEXT,
  ADD COLUMN IF NOT EXISTS ad_format TEXT,
  ADD COLUMN IF NOT EXISTS ad_goal TEXT,
  ADD COLUMN IF NOT EXISTS ad_compliance_acknowledged BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ad_compliance_acknowledged_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_composer_projects_ad_framework
  ON public.composer_projects(ad_framework)
  WHERE ad_framework IS NOT NULL;