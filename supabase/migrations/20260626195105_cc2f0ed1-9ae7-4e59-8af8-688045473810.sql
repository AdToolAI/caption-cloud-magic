
-- Sprint 2 Foundation: Brand Voice Samples + ensure brand_assets is ready
-- brand_voice_samples already exists per index, but ensure schema correctness
CREATE TABLE IF NOT EXISTS public.brand_voice_samples (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_kit_id UUID NOT NULL REFERENCES public.brand_kits(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('do','dont','tagline','banned')),
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_voice_samples TO authenticated;
GRANT ALL ON public.brand_voice_samples TO service_role;

ALTER TABLE public.brand_voice_samples ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='brand_voice_samples' AND policyname='own_voice_samples_all') THEN
    CREATE POLICY own_voice_samples_all ON public.brand_voice_samples
      FOR ALL TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_brand_voice_samples_kit ON public.brand_voice_samples(brand_kit_id);
