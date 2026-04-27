-- Add system-snippet support to motion_studio_scene_snippets
ALTER TABLE public.motion_studio_scene_snippets
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS preview_video_url text,
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attribution_name text,
  ADD COLUMN IF NOT EXISTS attribution_url text,
  ADD COLUMN IF NOT EXISTS source text;

-- user_id should be nullable for system snippets
ALTER TABLE public.motion_studio_scene_snippets
  ALTER COLUMN user_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_scene_snippets_system
  ON public.motion_studio_scene_snippets (is_system, category, sort_order);

-- RLS: anyone authenticated can read system snippets
DROP POLICY IF EXISTS "System snippets viewable by all authenticated users"
  ON public.motion_studio_scene_snippets;

CREATE POLICY "System snippets viewable by all authenticated users"
  ON public.motion_studio_scene_snippets
  FOR SELECT
  TO authenticated
  USING (is_system = true);
