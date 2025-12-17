-- Universal Video Creator Progress Table (for real-time tracking)
CREATE TABLE IF NOT EXISTS public.universal_video_progress (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  current_step TEXT,
  progress_percent INTEGER DEFAULT 0,
  status_message TEXT,
  briefing_json JSONB,
  result_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE public.universal_video_progress ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own progress"
  ON public.universal_video_progress
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own progress"
  ON public.universal_video_progress
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can manage all progress"
  ON public.universal_video_progress
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Enable realtime for progress updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.universal_video_progress;

-- Universal Video Renders Table
CREATE TABLE IF NOT EXISTS public.universal_video_renders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  render_id TEXT,
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  input_props JSONB,
  output_url TEXT,
  aspect_ratio TEXT DEFAULT '16:9',
  duration_seconds INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE public.universal_video_renders ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own renders"
  ON public.universal_video_renders
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own renders"
  ON public.universal_video_renders
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_universal_video_progress_user_id ON public.universal_video_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_universal_video_progress_status ON public.universal_video_progress(status);
CREATE INDEX IF NOT EXISTS idx_universal_video_renders_user_id ON public.universal_video_renders(user_id);
CREATE INDEX IF NOT EXISTS idx_universal_video_renders_render_id ON public.universal_video_renders(render_id);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_universal_video_progress_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_universal_video_progress_timestamp
  BEFORE UPDATE ON public.universal_video_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.update_universal_video_progress_updated_at();

CREATE TRIGGER update_universal_video_renders_timestamp
  BEFORE UPDATE ON public.universal_video_renders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_universal_video_progress_updated_at();