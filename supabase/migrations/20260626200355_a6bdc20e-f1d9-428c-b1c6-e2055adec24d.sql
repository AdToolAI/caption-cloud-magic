
-- Sprint 3: Sharing-Token + Read access for shared brand kits
ALTER TABLE public.brand_kits
  ADD COLUMN IF NOT EXISTS share_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS share_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS industry text;

CREATE INDEX IF NOT EXISTS idx_brand_kits_share_token ON public.brand_kits(share_token) WHERE share_token IS NOT NULL;

-- Allow anonymous read of brand kits when a valid (non-expired) share_token is supplied
GRANT SELECT ON public.brand_kits TO anon;

DROP POLICY IF EXISTS "Public can read shared brand kits" ON public.brand_kits;
CREATE POLICY "Public can read shared brand kits"
ON public.brand_kits
FOR SELECT
TO anon, authenticated
USING (
  share_token IS NOT NULL
  AND (share_expires_at IS NULL OR share_expires_at > now())
);

-- Brand-Trends Radar cache (per industry/locale, 24h TTL)
CREATE TABLE IF NOT EXISTS public.brand_trends_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_kit_id uuid REFERENCES public.brand_kits(id) ON DELETE CASCADE,
  industry text,
  locale text DEFAULT 'de',
  trends jsonb NOT NULL DEFAULT '[]'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_trends_cache TO authenticated;
GRANT ALL ON public.brand_trends_cache TO service_role;

ALTER TABLE public.brand_trends_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own brand trends"
ON public.brand_trends_cache FOR SELECT
TO authenticated
USING (
  brand_kit_id IS NULL OR EXISTS (
    SELECT 1 FROM public.brand_kits bk
    WHERE bk.id = brand_trends_cache.brand_kit_id AND bk.user_id = auth.uid()
  )
);

CREATE POLICY "Users can write own brand trends"
ON public.brand_trends_cache FOR INSERT
TO authenticated
WITH CHECK (
  brand_kit_id IS NULL OR EXISTS (
    SELECT 1 FROM public.brand_kits bk
    WHERE bk.id = brand_trends_cache.brand_kit_id AND bk.user_id = auth.uid()
  )
);
