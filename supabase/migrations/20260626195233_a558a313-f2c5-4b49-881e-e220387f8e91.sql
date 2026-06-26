
-- Add kind column (default 'do' for legacy rows)
ALTER TABLE public.brand_voice_samples
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'do'
  CHECK (kind IN ('do','dont','tagline','banned'));

-- Add text column as alias for sample_text (keep both for back-compat)
ALTER TABLE public.brand_voice_samples
  ADD COLUMN IF NOT EXISTS text TEXT;

-- Backfill text from sample_text where missing
UPDATE public.brand_voice_samples SET text = sample_text WHERE text IS NULL AND sample_text IS NOT NULL;

-- Make sample_text nullable so new inserts can omit it
ALTER TABLE public.brand_voice_samples ALTER COLUMN sample_text DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_brand_voice_samples_kit_kind ON public.brand_voice_samples(brand_kit_id, kind);
