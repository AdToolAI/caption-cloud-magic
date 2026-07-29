CREATE TABLE public.audiobook_projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'Neues Hörbuch',
  author TEXT,
  language TEXT NOT NULL DEFAULT 'de',
  cast_config JSONB NOT NULL DEFAULT '{"narrator": null, "characters": []}'::jsonb,
  paragraph_gap_ms INTEGER NOT NULL DEFAULT 400,
  chapter_gap_ms INTEGER NOT NULL DEFAULT 1200,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.audiobook_projects TO authenticated;
GRANT ALL ON public.audiobook_projects TO service_role;
ALTER TABLE public.audiobook_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own audiobook projects"
  ON public.audiobook_projects FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.audiobook_chapters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.audiobook_projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  chapter_index INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL DEFAULT 'Kapitel',
  body TEXT NOT NULL DEFAULT '',
  char_count INTEGER NOT NULL DEFAULT 0,
  audio_url TEXT,
  duration_seconds NUMERIC,
  render_status TEXT NOT NULL DEFAULT 'idle',
  render_progress INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.audiobook_chapters TO authenticated;
GRANT ALL ON public.audiobook_chapters TO service_role;
ALTER TABLE public.audiobook_chapters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own audiobook chapters"
  ON public.audiobook_chapters FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_audiobook_chapters_project ON public.audiobook_chapters(project_id, chapter_index);
CREATE INDEX idx_audiobook_projects_user ON public.audiobook_projects(user_id, updated_at DESC);

CREATE TRIGGER update_audiobook_projects_updated_at
  BEFORE UPDATE ON public.audiobook_projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_audiobook_chapters_updated_at
  BEFORE UPDATE ON public.audiobook_chapters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();