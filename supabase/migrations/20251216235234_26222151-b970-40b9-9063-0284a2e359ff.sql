-- Create universal_video_generation_progress table
CREATE TABLE public.universal_video_generation_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  current_step TEXT DEFAULT 'pending',
  step_index INTEGER DEFAULT 0,
  progress INTEGER DEFAULT 0,
  message TEXT,
  consultation_result JSONB,
  script JSONB,
  assets_json JSONB DEFAULT '[]'::jsonb,
  voiceover_url TEXT,
  music_url TEXT,
  render_results JSONB DEFAULT '{}'::jsonb,
  project_data JSONB,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.universal_video_generation_progress ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own progress"
  ON public.universal_video_generation_progress
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own progress"
  ON public.universal_video_generation_progress
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own progress"
  ON public.universal_video_generation_progress
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access"
  ON public.universal_video_generation_progress
  FOR ALL
  USING ((auth.jwt() ->> 'role'::text) = 'service_role');

-- Enable Realtime for progress updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.universal_video_generation_progress;

-- Index for user lookups
CREATE INDEX idx_universal_video_progress_user_id ON public.universal_video_generation_progress(user_id);
CREATE INDEX idx_universal_video_progress_status ON public.universal_video_generation_progress(status);