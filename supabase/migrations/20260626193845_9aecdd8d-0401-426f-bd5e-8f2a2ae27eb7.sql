
ALTER TABLE public.brand_characters
  ADD COLUMN IF NOT EXISTS brand_kit_id uuid REFERENCES public.brand_kits(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_brand_characters_kit ON public.brand_characters(brand_kit_id);

ALTER TABLE public.brand_locations
  ADD COLUMN IF NOT EXISTS brand_kit_id uuid REFERENCES public.brand_kits(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_brand_locations_kit ON public.brand_locations(brand_kit_id);

CREATE TABLE IF NOT EXISTS public.brand_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_kit_id uuid NOT NULL REFERENCES public.brand_kits(id) ON DELETE CASCADE,
  kind text NOT NULL,
  url text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_assets TO authenticated;
GRANT ALL ON public.brand_assets TO service_role;
ALTER TABLE public.brand_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own brand assets" ON public.brand_assets
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_brand_assets_kit ON public.brand_assets(brand_kit_id);

CREATE TABLE IF NOT EXISTS public.brand_drift_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_kit_id uuid NOT NULL REFERENCES public.brand_kits(id) ON DELETE CASCADE,
  source_table text NOT NULL,
  source_id uuid,
  severity text NOT NULL DEFAULT 'info',
  score numeric,
  suggested_fix jsonb NOT NULL DEFAULT '{}'::jsonb,
  preview_url text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_drift_reports TO authenticated;
GRANT ALL ON public.brand_drift_reports TO service_role;
ALTER TABLE public.brand_drift_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own drift reports" ON public.brand_drift_reports
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users resolve own drift" ON public.brand_drift_reports
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_brand_drift_kit ON public.brand_drift_reports(brand_kit_id, created_at DESC);
