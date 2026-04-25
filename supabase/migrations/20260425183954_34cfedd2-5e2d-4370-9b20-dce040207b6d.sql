-- Block E (Legal): Library upload consent + AI provenance tracking

-- 1. Track legal consent acceptance per user (DSGVO/GDPR audit trail)
CREATE TABLE IF NOT EXISTS public.user_legal_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  consent_type text NOT NULL,           -- 'motion_studio_library_upload'
  consent_version text NOT NULL,        -- '1.0' (bump on legal text change)
  accepted_at timestamptz NOT NULL DEFAULT now(),
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (user_id, consent_type, consent_version)
);

ALTER TABLE public.user_legal_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own consents"
  ON public.user_legal_consents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own consents"
  ON public.user_legal_consents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_legal_consents_lookup
  ON public.user_legal_consents (user_id, consent_type);

-- 2. Add provenance + consent metadata to library tables (idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'motion_studio_characters') THEN
    ALTER TABLE public.motion_studio_characters
      ADD COLUMN IF NOT EXISTS is_ai_generated boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS depicts_real_person boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS consent_recorded_at timestamptz,
      ADD COLUMN IF NOT EXISTS consent_version text;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'motion_studio_locations') THEN
    ALTER TABLE public.motion_studio_locations
      ADD COLUMN IF NOT EXISTS is_ai_generated boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS consent_recorded_at timestamptz,
      ADD COLUMN IF NOT EXISTS consent_version text;
  END IF;
END $$;