
CREATE TABLE IF NOT EXISTS public.composer_production_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  project_id UUID NULL,
  version INTEGER NOT NULL DEFAULT 1,
  source_text TEXT NOT NULL,
  manifest JSONB NOT NULL,
  unresolved JSONB NOT NULL DEFAULT '[]'::jsonb,
  parser_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS composer_production_plans_user_id_idx
  ON public.composer_production_plans(user_id);
CREATE INDEX IF NOT EXISTS composer_production_plans_project_id_idx
  ON public.composer_production_plans(project_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.composer_production_plans TO authenticated;
GRANT ALL ON public.composer_production_plans TO service_role;

ALTER TABLE public.composer_production_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own production plans"
  ON public.composer_production_plans
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.touch_composer_production_plans_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS composer_production_plans_touch ON public.composer_production_plans;
CREATE TRIGGER composer_production_plans_touch
  BEFORE UPDATE ON public.composer_production_plans
  FOR EACH ROW EXECUTE FUNCTION public.touch_composer_production_plans_updated_at();
