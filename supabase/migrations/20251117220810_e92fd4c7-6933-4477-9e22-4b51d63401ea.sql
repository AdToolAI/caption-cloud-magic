-- Create video_templates table
CREATE TABLE IF NOT EXISTS public.video_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  preview_url TEXT,
  template_config JSONB NOT NULL,
  platforms TEXT[] DEFAULT ARRAY['instagram', 'tiktok', 'facebook'],
  aspect_ratio TEXT NOT NULL,
  duration INTEGER NOT NULL,
  category TEXT NOT NULL,
  customizable_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create video_creations table
CREATE TABLE IF NOT EXISTS public.video_creations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  template_id UUID REFERENCES public.video_templates(id) ON DELETE CASCADE,
  customizations JSONB DEFAULT '{}'::jsonb,
  render_id TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'rendering', 'completed', 'failed')),
  output_url TEXT,
  error_message TEXT,
  credits_used INTEGER DEFAULT 50,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.video_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_creations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for video_templates (public read)
CREATE POLICY "Anyone can view video templates"
  ON public.video_templates
  FOR SELECT
  USING (true);

-- RLS Policies for video_creations
CREATE POLICY "Users can view own video creations"
  ON public.video_creations
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own video creations"
  ON public.video_creations
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own video creations"
  ON public.video_creations
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own video creations"
  ON public.video_creations
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create indexes
CREATE INDEX idx_video_creations_user_id ON public.video_creations(user_id);
CREATE INDEX idx_video_creations_status ON public.video_creations(status);
CREATE INDEX idx_video_creations_created_at ON public.video_creations(created_at DESC);
CREATE INDEX idx_video_templates_category ON public.video_templates(category);

-- Add feature cost for video generation
INSERT INTO public.feature_costs (feature_code, credits_per_use, description)
VALUES ('video_generation', 50, 'Generate professional ad video from template')
ON CONFLICT (feature_code) DO NOTHING;