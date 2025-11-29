-- Neue Tabelle für Long-Form Projekte
CREATE TABLE public.sora_long_form_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Neues Projekt',
  target_duration INTEGER NOT NULL CHECK (target_duration IN (30, 60, 120)),
  aspect_ratio TEXT NOT NULL DEFAULT '16:9',
  model TEXT NOT NULL DEFAULT 'sora-2-standard',
  status TEXT NOT NULL DEFAULT 'draft',
  script TEXT,
  final_video_url TEXT,
  total_cost_euros NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Szenen für Long-Form Projekte
CREATE TABLE public.sora_long_form_scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.sora_long_form_projects(id) ON DELETE CASCADE,
  scene_order INTEGER NOT NULL,
  duration INTEGER NOT NULL CHECK (duration IN (4, 8, 12)),
  prompt TEXT NOT NULL DEFAULT '',
  reference_image_url TEXT,
  generated_video_url TEXT,
  replicate_prediction_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  transition_type TEXT DEFAULT 'crossfade',
  transition_duration NUMERIC(3,2) DEFAULT 0.5,
  cost_euros NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS aktivieren
ALTER TABLE public.sora_long_form_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sora_long_form_scenes ENABLE ROW LEVEL SECURITY;

-- RLS Policies für Projekte
CREATE POLICY "Users can view own projects"
ON public.sora_long_form_projects FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can create own projects"
ON public.sora_long_form_projects FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own projects"
ON public.sora_long_form_projects FOR UPDATE
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can delete own projects"
ON public.sora_long_form_projects FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- RLS Policies für Szenen
CREATE POLICY "Users can view own scenes"
ON public.sora_long_form_scenes FOR SELECT
TO authenticated
USING (
  project_id IN (
    SELECT id FROM public.sora_long_form_projects WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can create own scenes"
ON public.sora_long_form_scenes FOR INSERT
TO authenticated
WITH CHECK (
  project_id IN (
    SELECT id FROM public.sora_long_form_projects WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can update own scenes"
ON public.sora_long_form_scenes FOR UPDATE
TO authenticated
USING (
  project_id IN (
    SELECT id FROM public.sora_long_form_projects WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete own scenes"
ON public.sora_long_form_scenes FOR DELETE
TO authenticated
USING (
  project_id IN (
    SELECT id FROM public.sora_long_form_projects WHERE user_id = auth.uid()
  )
);

-- Realtime aktivieren für Live-Updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.sora_long_form_projects;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sora_long_form_scenes;

-- Indexes für Performance
CREATE INDEX idx_sora_projects_user_id ON public.sora_long_form_projects(user_id);
CREATE INDEX idx_sora_scenes_project_id ON public.sora_long_form_scenes(project_id);
CREATE INDEX idx_sora_scenes_status ON public.sora_long_form_scenes(status);