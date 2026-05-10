ALTER TABLE public.composer_scenes
  ADD COLUMN IF NOT EXISTS preview_clip_url TEXT,
  ADD COLUMN IF NOT EXISTS preview_status TEXT;

COMMENT ON COLUMN public.composer_scenes.preview_clip_url IS
  'Phase 5.1 — low-res LTX-Video preview shown while the HQ provider still renders. Replaced atomically when the HQ clipUrl arrives.';
COMMENT ON COLUMN public.composer_scenes.preview_status IS
  'Phase 5.1 — pending | generating | ready | failed. Independent from clip_status so the user sees a fast preview before the real clip is done.';