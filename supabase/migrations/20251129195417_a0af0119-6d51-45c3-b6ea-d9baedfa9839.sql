-- Create table for Director's Cut Sora 2 enhancements
CREATE TABLE IF NOT EXISTS public.director_cut_enhancements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID,
  scene_id TEXT NOT NULL,
  original_frame_url TEXT NOT NULL,
  generated_video_url TEXT,
  prompt TEXT NOT NULL,
  model TEXT NOT NULL CHECK (model IN ('sora-2-standard', 'sora-2-pro')),
  duration_seconds INTEGER NOT NULL CHECK (duration_seconds IN (4, 8, 12)),
  aspect_ratio TEXT DEFAULT '16:9',
  cost_euros DECIMAL(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  replicate_prediction_id TEXT,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.director_cut_enhancements ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own enhancements"
ON public.director_cut_enhancements FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own enhancements"
ON public.director_cut_enhancements FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can update enhancements"
ON public.director_cut_enhancements FOR UPDATE
USING (true);

-- Index for faster lookups
CREATE INDEX idx_director_cut_enhancements_user_id ON public.director_cut_enhancements(user_id);
CREATE INDEX idx_director_cut_enhancements_prediction_id ON public.director_cut_enhancements(replicate_prediction_id);
CREATE INDEX idx_director_cut_enhancements_status ON public.director_cut_enhancements(status);

-- Enable realtime for status updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.director_cut_enhancements;