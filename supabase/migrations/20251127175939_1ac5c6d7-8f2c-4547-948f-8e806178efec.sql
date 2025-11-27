
-- Create director_cut_projects table for video post-production projects
CREATE TABLE public.director_cut_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  project_name TEXT DEFAULT 'Unbenanntes Projekt',
  source_video_url TEXT NOT NULL,
  source_video_id UUID REFERENCES public.video_creations(id) ON DELETE SET NULL,
  duration_seconds NUMERIC,
  scene_analysis JSONB DEFAULT '[]'::jsonb,
  applied_effects JSONB DEFAULT '{}'::jsonb,
  audio_enhancements JSONB DEFAULT '{}'::jsonb,
  export_settings JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'analyzing', 'editing', 'rendering', 'completed', 'failed')),
  output_url TEXT,
  credits_used INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.director_cut_projects ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own director cut projects"
ON public.director_cut_projects
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own director cut projects"
ON public.director_cut_projects
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own director cut projects"
ON public.director_cut_projects
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own director cut projects"
ON public.director_cut_projects
FOR DELETE
USING (auth.uid() = user_id);

-- Updated at trigger
CREATE TRIGGER update_director_cut_projects_updated_at
BEFORE UPDATE ON public.director_cut_projects
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index for faster queries
CREATE INDEX idx_director_cut_projects_user_id ON public.director_cut_projects(user_id);
CREATE INDEX idx_director_cut_projects_status ON public.director_cut_projects(status);
