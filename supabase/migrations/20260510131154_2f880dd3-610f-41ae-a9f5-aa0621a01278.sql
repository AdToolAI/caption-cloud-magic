ALTER TABLE public.composer_scenes
  ADD COLUMN IF NOT EXISTS seed INTEGER,
  ADD COLUMN IF NOT EXISTS seed_variations JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.composer_scenes.seed IS 'Phase 5.3 — Master seed for HQ render. Set when user picks a Fast-Preview variant.';
COMMENT ON COLUMN public.composer_scenes.seed_variations IS 'Phase 5.3 — Up to 4 LTX Fast-Preview variants: [{seed, previewUrl, status, createdAt}].';