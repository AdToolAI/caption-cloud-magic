ALTER TABLE public.brand_characters
  ADD COLUMN IF NOT EXISTS default_voice_id text,
  ADD COLUMN IF NOT EXISTS default_voice_provider text DEFAULT 'elevenlabs',
  ADD COLUMN IF NOT EXISTS default_voice_name text,
  ADD COLUMN IF NOT EXISTS portrait_url text,
  ADD COLUMN IF NOT EXISTS portrait_mode text DEFAULT 'original',
  ADD COLUMN IF NOT EXISTS default_language text DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS default_aspect_ratio text DEFAULT '9:16';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'brand_characters_voice_provider_check') THEN
    ALTER TABLE public.brand_characters
      ADD CONSTRAINT brand_characters_voice_provider_check
      CHECK (default_voice_provider IN ('elevenlabs','custom'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'brand_characters_portrait_mode_check') THEN
    ALTER TABLE public.brand_characters
      ADD CONSTRAINT brand_characters_portrait_mode_check
      CHECK (portrait_mode IN ('original','auto_generated','manual_upload'));
  END IF;
END $$;