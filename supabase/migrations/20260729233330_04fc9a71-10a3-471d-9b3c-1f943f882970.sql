ALTER TABLE public.composer_projects
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'composer';

ALTER TABLE public.autopilot_productions
  ADD COLUMN IF NOT EXISTS composer_project_id uuid;

ALTER TABLE public.autopilot_production_scenes
  ADD COLUMN IF NOT EXISTS composer_scene_id uuid;

CREATE INDEX IF NOT EXISTS composer_projects_origin_idx
  ON public.composer_projects (user_id, origin);