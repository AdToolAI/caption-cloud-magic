-- Create director_cut_renders table for render history
CREATE TABLE public.director_cut_renders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  project_id UUID REFERENCES public.director_cut_projects(id) ON DELETE SET NULL,
  
  -- Source video info
  source_video_url TEXT NOT NULL,
  source_video_duration INTEGER,
  
  -- Render configuration
  effects_config JSONB DEFAULT '{}'::jsonb,
  audio_config JSONB DEFAULT '{}'::jsonb,
  export_settings JSONB DEFAULT '{}'::jsonb,
  premium_features JSONB DEFAULT '{}'::jsonb,
  
  -- Render status
  status TEXT NOT NULL DEFAULT 'queued',
  progress INTEGER DEFAULT 0,
  remotion_render_id TEXT,
  bucket_name TEXT,
  
  -- Output
  output_url TEXT,
  output_format TEXT DEFAULT 'mp4',
  output_width INTEGER,
  output_height INTEGER,
  output_duration_seconds INTEGER,
  file_size_bytes BIGINT,
  
  -- Credits
  credits_used INTEGER NOT NULL DEFAULT 0,
  credits_breakdown JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  
  -- Error handling
  error_message TEXT,
  retry_count INTEGER DEFAULT 0
);

-- Enable RLS
ALTER TABLE public.director_cut_renders ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own renders"
  ON public.director_cut_renders
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own renders"
  ON public.director_cut_renders
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can update renders"
  ON public.director_cut_renders
  FOR UPDATE
  USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

CREATE POLICY "Users can delete their own renders"
  ON public.director_cut_renders
  FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX idx_director_cut_renders_user_id ON public.director_cut_renders(user_id);
CREATE INDEX idx_director_cut_renders_status ON public.director_cut_renders(status);
CREATE INDEX idx_director_cut_renders_project_id ON public.director_cut_renders(project_id);
CREATE INDEX idx_director_cut_renders_created_at ON public.director_cut_renders(created_at DESC);

-- Enable Realtime for status updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.director_cut_renders;

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_director_cut_renders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at column
ALTER TABLE public.director_cut_renders ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();

CREATE TRIGGER update_director_cut_renders_timestamp
  BEFORE UPDATE ON public.director_cut_renders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_director_cut_renders_updated_at();