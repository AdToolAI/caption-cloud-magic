
ALTER TABLE public.composer_scenes
  ADD COLUMN IF NOT EXISTS preview_anchor_url TEXT,
  ADD COLUMN IF NOT EXISTS preview_audit JSONB,
  ADD COLUMN IF NOT EXISTS anchor_confirmed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.composer_scenes.preview_anchor_url IS
  'v263 Anchor-Preview-Gate: URL of the anchor image rendered in preview mode before Hailuo+Sync.so spend.';
COMMENT ON COLUMN public.composer_scenes.preview_audit IS
  'v263 Anchor-Preview-Gate: identity-audit JSON (reason, missing[], duplicated[], mismatched[], faceCount, humanCount) for the preview anchor.';
COMMENT ON COLUMN public.composer_scenes.anchor_confirmed_at IS
  'v263 Anchor-Preview-Gate: timestamp when the user accepted the preview anchor and released it for full Hailuo+Sync.so render.';
