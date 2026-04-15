
-- Composer Projects table
CREATE TABLE public.composer_projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Untitled Project',
  category TEXT NOT NULL DEFAULT 'custom',
  briefing JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft',
  storyboard JSONB NOT NULL DEFAULT '[]'::jsonb,
  assembly_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_url TEXT,
  thumbnail_url TEXT,
  total_cost_euros NUMERIC(10,4) NOT NULL DEFAULT 0,
  language TEXT NOT NULL DEFAULT 'de',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.composer_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own composer projects"
  ON public.composer_projects FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own composer projects"
  ON public.composer_projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own composer projects"
  ON public.composer_projects FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own composer projects"
  ON public.composer_projects FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_composer_projects_updated_at
  BEFORE UPDATE ON public.composer_projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Composer Scenes table
CREATE TABLE public.composer_scenes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.composer_projects(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL DEFAULT 0,
  scene_type TEXT NOT NULL DEFAULT 'custom',
  duration_seconds NUMERIC(5,1) NOT NULL DEFAULT 5,
  clip_source TEXT NOT NULL DEFAULT 'stock',
  ai_prompt TEXT,
  stock_keywords TEXT,
  upload_url TEXT,
  clip_url TEXT,
  clip_status TEXT NOT NULL DEFAULT 'pending',
  text_overlay JSONB NOT NULL DEFAULT '{}'::jsonb,
  transition_type TEXT NOT NULL DEFAULT 'fade',
  transition_duration NUMERIC(3,1) NOT NULL DEFAULT 0.5,
  replicate_prediction_id TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  cost_euros NUMERIC(10,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.composer_scenes ENABLE ROW LEVEL SECURITY;

-- Security definer function to check project ownership
CREATE OR REPLACE FUNCTION public.owns_composer_project(_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.composer_projects
    WHERE id = _project_id AND user_id = auth.uid()
  )
$$;

CREATE POLICY "Users can view own composer scenes"
  ON public.composer_scenes FOR SELECT
  USING (public.owns_composer_project(project_id));

CREATE POLICY "Users can create scenes in own projects"
  ON public.composer_scenes FOR INSERT
  WITH CHECK (public.owns_composer_project(project_id));

CREATE POLICY "Users can update scenes in own projects"
  ON public.composer_scenes FOR UPDATE
  USING (public.owns_composer_project(project_id));

CREATE POLICY "Users can delete scenes in own projects"
  ON public.composer_scenes FOR DELETE
  USING (public.owns_composer_project(project_id));

CREATE TRIGGER update_composer_scenes_updated_at
  BEFORE UPDATE ON public.composer_scenes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_composer_scenes_project_id ON public.composer_scenes(project_id);
CREATE INDEX idx_composer_projects_user_id ON public.composer_projects(user_id);
CREATE INDEX idx_composer_projects_status ON public.composer_projects(status);
