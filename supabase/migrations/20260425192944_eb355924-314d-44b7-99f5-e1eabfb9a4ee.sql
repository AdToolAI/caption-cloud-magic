CREATE TABLE public.composer_exports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES public.composer_projects(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  preset_key TEXT NOT NULL,
  aspect_ratio TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  render_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  video_url TEXT,
  estimated_cost_euros NUMERIC(10,4) DEFAULT 0.10,
  actual_cost_euros NUMERIC(10,4),
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_composer_exports_project ON public.composer_exports(project_id);
CREATE INDEX idx_composer_exports_user ON public.composer_exports(user_id);
CREATE INDEX idx_composer_exports_render_id ON public.composer_exports(render_id);

ALTER TABLE public.composer_exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own composer exports"
ON public.composer_exports FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users create own composer exports"
ON public.composer_exports FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own composer exports"
ON public.composer_exports FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users delete own composer exports"
ON public.composer_exports FOR DELETE
USING (auth.uid() = user_id);

CREATE TRIGGER update_composer_exports_updated_at
BEFORE UPDATE ON public.composer_exports
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();