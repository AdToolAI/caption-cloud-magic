ALTER TABLE public.composer_scenes
  ADD COLUMN IF NOT EXISTS lip_sync_applied_at timestamptz,
  ADD COLUMN IF NOT EXISTS lip_sync_source_clip_url text,
  ADD COLUMN IF NOT EXISTS lip_sync_status text;