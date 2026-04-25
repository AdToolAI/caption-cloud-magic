-- Compare Lab Runs
CREATE TABLE public.compare_lab_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  prompt_slots JSONB,
  engines TEXT[] NOT NULL DEFAULT '{}',
  duration_seconds INTEGER NOT NULL DEFAULT 5,
  aspect_ratio TEXT NOT NULL DEFAULT '16:9',
  source_image_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  total_cost_euros NUMERIC(10,4) DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  ai_judge_winner_engine TEXT,
  ai_judge_reasoning TEXT,
  ai_judge_scores JSONB,
  ai_judge_completed_at TIMESTAMPTZ,
  user_winner_engine TEXT,
  composer_scene_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_compare_lab_runs_user ON public.compare_lab_runs(user_id, created_at DESC);
CREATE INDEX idx_compare_lab_runs_status ON public.compare_lab_runs(status);

-- Compare Lab Outputs (one per engine per run)
CREATE TABLE public.compare_lab_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.compare_lab_runs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  engine TEXT NOT NULL,
  model TEXT NOT NULL,
  generation_id UUID,
  status TEXT NOT NULL DEFAULT 'pending',
  video_url TEXT,
  thumbnail_url TEXT,
  cost_euros NUMERIC(10,4) DEFAULT 0,
  duration_seconds INTEGER,
  error_message TEXT,
  user_rating INTEGER CHECK (user_rating BETWEEN 1 AND 5),
  user_note TEXT,
  is_user_winner BOOLEAN NOT NULL DEFAULT false,
  is_ai_pick BOOLEAN NOT NULL DEFAULT false,
  ai_judge_score NUMERIC(5,2),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_compare_lab_outputs_run ON public.compare_lab_outputs(run_id);
CREATE INDEX idx_compare_lab_outputs_user ON public.compare_lab_outputs(user_id);
CREATE INDEX idx_compare_lab_outputs_status ON public.compare_lab_outputs(status);

-- RLS
ALTER TABLE public.compare_lab_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compare_lab_outputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own compare runs"
  ON public.compare_lab_runs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own compare runs"
  ON public.compare_lab_runs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own compare runs"
  ON public.compare_lab_runs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own compare runs"
  ON public.compare_lab_runs FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users view own compare outputs"
  ON public.compare_lab_outputs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own compare outputs"
  ON public.compare_lab_outputs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own compare outputs"
  ON public.compare_lab_outputs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own compare outputs"
  ON public.compare_lab_outputs FOR DELETE
  USING (auth.uid() = user_id);

-- Updated-at triggers
CREATE TRIGGER update_compare_lab_runs_updated_at
  BEFORE UPDATE ON public.compare_lab_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_compare_lab_outputs_updated_at
  BEFORE UPDATE ON public.compare_lab_outputs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.compare_lab_runs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.compare_lab_outputs;
ALTER TABLE public.compare_lab_runs REPLICA IDENTITY FULL;
ALTER TABLE public.compare_lab_outputs REPLICA IDENTITY FULL;