CREATE TABLE IF NOT EXISTS public.composer_pipeline_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.composer_projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  total_scenes int NOT NULL DEFAULT 0,
  completed_scenes int NOT NULL DEFAULT 0,
  failed_scenes int NOT NULL DEFAULT 0,
  stitched_video_url text,
  director_cut_project_id uuid,
  destination text DEFAULT 'directors_cut',
  allow_partial boolean DEFAULT false,
  error_message text,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.composer_pipeline_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own pipeline runs"
  ON public.composer_pipeline_runs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own pipeline runs"
  ON public.composer_pipeline_runs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own pipeline runs"
  ON public.composer_pipeline_runs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own pipeline runs"
  ON public.composer_pipeline_runs FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_composer_pipeline_runs_project ON public.composer_pipeline_runs(project_id);
CREATE INDEX IF NOT EXISTS idx_composer_pipeline_runs_user ON public.composer_pipeline_runs(user_id, created_at DESC);

CREATE TRIGGER trg_composer_pipeline_runs_updated_at
  BEFORE UPDATE ON public.composer_pipeline_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.composer_pipeline_runs;
ALTER TABLE public.composer_pipeline_runs REPLICA IDENTITY FULL;

ALTER TABLE public.composer_scenes
  ADD COLUMN IF NOT EXISTS progress_percent int DEFAULT 0;