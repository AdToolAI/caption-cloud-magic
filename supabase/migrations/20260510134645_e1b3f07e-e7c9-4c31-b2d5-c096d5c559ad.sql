
CREATE TABLE public.license_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  certificate_number text NOT NULL UNIQUE,
  asset_type text NOT NULL,
  asset_id text NOT NULL,
  asset_title text NOT NULL,
  asset_thumbnail_url text,
  asset_source_url text,
  source_provider text NOT NULL,
  provider_license_name text NOT NULL,
  provider_license_url text,
  license_tier text NOT NULL DEFAULT 'commercial',
  permitted_uses text[] NOT NULL DEFAULT '{}',
  restrictions text[] NOT NULL DEFAULT '{}',
  attribution_required boolean NOT NULL DEFAULT false,
  verify_token text NOT NULL UNIQUE,
  pdf_storage_path text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  issued_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_license_certificates_user ON public.license_certificates(user_id, issued_at DESC);
CREATE INDEX idx_license_certificates_asset ON public.license_certificates(user_id, asset_type, asset_id);
CREATE INDEX idx_license_certificates_verify_token ON public.license_certificates(verify_token);

ALTER TABLE public.license_certificates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their own certificates"
  ON public.license_certificates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users create their own certificates"
  ON public.license_certificates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update their own certificates"
  ON public.license_certificates FOR UPDATE
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_license_certificates_updated_at
  BEFORE UPDATE ON public.license_certificates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.verify_license_certificate(_token text)
RETURNS TABLE (
  certificate_number text,
  asset_title text,
  asset_type text,
  asset_thumbnail_url text,
  source_provider text,
  provider_license_name text,
  provider_license_url text,
  license_tier text,
  permitted_uses text[],
  restrictions text[],
  attribution_required boolean,
  issued_at timestamptz,
  revoked_at timestamptz,
  licensee_initials text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    lc.certificate_number,
    lc.asset_title,
    lc.asset_type,
    lc.asset_thumbnail_url,
    lc.source_provider,
    lc.provider_license_name,
    lc.provider_license_url,
    lc.license_tier,
    lc.permitted_uses,
    lc.restrictions,
    lc.attribution_required,
    lc.issued_at,
    lc.revoked_at,
    COALESCE(
      LEFT(SPLIT_PART(p.name, ' ', 1), 1) ||
      NULLIF(LEFT(SPLIT_PART(p.name, ' ', 2), 1), ''),
      UPPER(LEFT(p.email, 1)),
      'U'
    ) AS licensee_initials
  FROM public.license_certificates lc
  LEFT JOIN public.profiles p ON p.id = lc.user_id
  WHERE lc.verify_token = _token
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.verify_license_certificate(text) TO anon, authenticated;

INSERT INTO storage.buckets (id, name, public)
VALUES ('license-certificates', 'license-certificates', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users read own license PDFs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'license-certificates'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users upload own license PDFs"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'license-certificates'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users update own license PDFs"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'license-certificates'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
