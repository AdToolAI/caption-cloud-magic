ALTER TABLE public.brand_characters
  ADD COLUMN IF NOT EXISTS identity_lock_strength text NOT NULL DEFAULT 'strict'
  CHECK (identity_lock_strength IN ('strict','balanced','creative'));