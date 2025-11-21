-- Create video_renders table for tracking video rendering jobs
CREATE TABLE IF NOT EXISTS public.video_renders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  render_id TEXT UNIQUE NOT NULL,
  project_id TEXT NOT NULL,
  format_config JSONB NOT NULL,
  content_config JSONB NOT NULL,
  subtitle_config JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  video_url TEXT,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_video_renders_render_id ON public.video_renders(render_id);
CREATE INDEX IF NOT EXISTS idx_video_renders_project_id ON public.video_renders(project_id);
CREATE INDEX IF NOT EXISTS idx_video_renders_status ON public.video_renders(status);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_video_renders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER video_renders_updated_at
BEFORE UPDATE ON public.video_renders
FOR EACH ROW
EXECUTE FUNCTION update_video_renders_updated_at();

-- Enable RLS
ALTER TABLE public.video_renders ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only see their own renders (based on auth.uid())
-- Note: This assumes project_id contains user info or you have a separate user_id column
-- For now, we'll make it accessible to authenticated users
CREATE POLICY "Users can view all video renders"
  ON public.video_renders
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Users can insert video renders"
  ON public.video_renders
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can update video renders"
  ON public.video_renders
  FOR UPDATE
  USING (auth.role() = 'authenticated');