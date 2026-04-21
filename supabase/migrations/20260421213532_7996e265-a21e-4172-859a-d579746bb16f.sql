-- Add effects column to composer_scenes for AI-selected scene effects
ALTER TABLE public.composer_scenes
  ADD COLUMN IF NOT EXISTS effects JSONB DEFAULT '[]'::jsonb;

-- Add video_mode to composer_projects briefing (stored in JSON briefing column already exists, but add explicit column for queries)
ALTER TABLE public.composer_projects
  ADD COLUMN IF NOT EXISTS video_mode TEXT DEFAULT 'video';

COMMENT ON COLUMN public.composer_scenes.effects IS 'Array of {id, color?, intensity?} effect configs layered above the scene clip in Remotion. Frame-deterministic, Lambda-safe.';
COMMENT ON COLUMN public.composer_projects.video_mode IS 'AI generation mode: video (AI clips), image (Gemini stills + Ken-Burns), mixed.';