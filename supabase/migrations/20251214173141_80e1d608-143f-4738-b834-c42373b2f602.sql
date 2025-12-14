-- Create explainer generation progress table for realtime updates
CREATE TABLE public.explainer_generation_progress (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  current_step TEXT NOT NULL DEFAULT 'pending',
  step_index INTEGER NOT NULL DEFAULT 0,
  progress INTEGER NOT NULL DEFAULT 0,
  message TEXT,
  assets_json JSONB DEFAULT '[]'::jsonb,
  error TEXT,
  project_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.explainer_generation_progress ENABLE ROW LEVEL SECURITY;

-- Users can view their own progress
CREATE POLICY "Users can view their own progress"
  ON public.explainer_generation_progress
  FOR SELECT
  USING (auth.uid() = user_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.explainer_generation_progress;