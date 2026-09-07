-- Phase 3A: persist the EXACT provider contract as part of the parity identity.
-- Additive only: no data rewrite, no dropped column, no changed row values.

-- 1) The executed provider contract, persisted on the generation itself.
ALTER TABLE public.ai_video_generations
  ADD COLUMN IF NOT EXISTS parity_provider_model_slug text;

COMMENT ON COLUMN public.ai_video_generations.parity_provider_model_slug IS
  'The concrete provider model slug actually dispatched for this run (route-scoped canonical identity). NULL for runs created before 2026-09-07; never reconstruct it from the current registry.';

-- 2) Parity state becomes route-scoped.
ALTER TABLE public.video_model_tier_parity
  ADD COLUMN IF NOT EXISTS provider_model_slug text;

COMMENT ON COLUMN public.video_model_tier_parity.provider_model_slug IS
  'Concrete provider contract this parity row is proof for. NULL = legacy/grandfathered row from before slug-scoping; it can never satisfy proof for a concrete slug.';

-- Deterministic uniqueness helper: NULL (legacy) collapses to the empty string,
-- which is distinct from every concrete slug. Keeps the nullable column while
-- giving the primary key NOT NULL semantics.
ALTER TABLE public.video_model_tier_parity
  ADD COLUMN IF NOT EXISTS provider_slug_key text
  GENERATED ALWAYS AS (COALESCE(provider_model_slug, '')) STORED;

-- 3) Widen the row identity by the provider contract.
ALTER TABLE public.video_model_tier_parity
  DROP CONSTRAINT IF EXISTS video_model_tier_parity_pkey;

ALTER TABLE public.video_model_tier_parity
  ADD CONSTRAINT video_model_tier_parity_pkey
  PRIMARY KEY (model_id, api_route, region, mode, resolution_label, provider_slug_key);

-- Fast lookup for the legacy (slug-less) identity so historical rows stay readable.
CREATE INDEX IF NOT EXISTS video_model_tier_parity_legacy_idx
  ON public.video_model_tier_parity (model_id, api_route, region, mode, resolution_label);