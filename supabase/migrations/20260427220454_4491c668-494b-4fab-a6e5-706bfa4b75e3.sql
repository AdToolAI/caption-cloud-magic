-- Stufe 2b: Ad Director Campaign Scaling
ALTER TABLE public.composer_projects
  ADD COLUMN IF NOT EXISTS ad_meta jsonb,
  ADD COLUMN IF NOT EXISTS ad_variant_strategy text,
  ADD COLUMN IF NOT EXISTS parent_project_id uuid REFERENCES public.composer_projects(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS cutdown_type text;

CREATE INDEX IF NOT EXISTS idx_composer_projects_parent_cutdown
  ON public.composer_projects(parent_project_id, cutdown_type);

CREATE INDEX IF NOT EXISTS idx_composer_projects_ad_variant
  ON public.composer_projects(ad_variant_strategy)
  WHERE ad_variant_strategy IS NOT NULL;

COMMENT ON COLUMN public.composer_projects.ad_meta IS 'Ad Director meta: framework, tonality, format, goal, brand_kit_snapshot, compliance_at';
COMMENT ON COLUMN public.composer_projects.ad_variant_strategy IS 'A/B variant strategy: emotional | rational | curiosity | null';
COMMENT ON COLUMN public.composer_projects.parent_project_id IS 'For cutdowns: references master composer_project';
COMMENT ON COLUMN public.composer_projects.cutdown_type IS 'master | 15s | 6s-hook | null';