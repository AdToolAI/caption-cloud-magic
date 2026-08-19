DROP POLICY IF EXISTS "Public can read shared brand kits" ON public.brand_kits;

CREATE OR REPLACE FUNCTION public.get_shared_brand_kit(p_token text)
RETURNS TABLE (
  id uuid,
  brand_name text,
  brand_tone text,
  primary_color character varying,
  secondary_color character varying,
  accent_color character varying,
  color_palette jsonb,
  target_audience text,
  brand_values jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    bk.id,
    bk.brand_name,
    bk.brand_tone,
    bk.primary_color,
    bk.secondary_color,
    bk.accent_color,
    bk.color_palette,
    bk.target_audience,
    bk.brand_values
  FROM public.brand_kits AS bk
  WHERE p_token IS NOT NULL
    AND pg_catalog.length(p_token) >= 16
    AND bk.share_token IS NOT NULL
    AND bk.share_token = p_token
    AND (bk.share_expires_at IS NULL OR bk.share_expires_at > pg_catalog.now())
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.get_shared_brand_kit(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_brand_kit(text) TO anon, authenticated;