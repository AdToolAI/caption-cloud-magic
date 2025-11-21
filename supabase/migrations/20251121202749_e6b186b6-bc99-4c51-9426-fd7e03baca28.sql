-- Create template versions table for version history
CREATE TABLE IF NOT EXISTS public.video_template_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.video_templates(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  shotstack_template JSONB NOT NULL,
  customizable_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  thumbnail_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  change_notes TEXT,
  is_published BOOLEAN DEFAULT false,
  UNIQUE(template_id, version_number)
);

-- Add version tracking to video_templates
ALTER TABLE public.video_templates
ADD COLUMN IF NOT EXISTS current_version INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS usage_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Create template categories enum if not exists
DO $$ BEGIN
  CREATE TYPE template_category AS ENUM (
    'social_media',
    'advertising',
    'explainer',
    'tutorial',
    'testimonial',
    'product_showcase',
    'event',
    'educational',
    'entertainment',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Update category column if it's not using the enum
ALTER TABLE public.video_templates
ALTER COLUMN category TYPE TEXT;

-- Enable RLS on template_versions
ALTER TABLE public.video_template_versions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for video_template_versions
CREATE POLICY "Users can view all published template versions"
  ON public.video_template_versions
  FOR SELECT
  USING (is_published = true OR created_by = auth.uid());

CREATE POLICY "Users can create template versions"
  ON public.video_template_versions
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update their own template versions"
  ON public.video_template_versions
  FOR UPDATE
  USING (created_by = auth.uid());

CREATE POLICY "Users can delete their own template versions"
  ON public.video_template_versions
  FOR DELETE
  USING (created_by = auth.uid());

-- Function to increment template usage count
CREATE OR REPLACE FUNCTION increment_template_usage(template_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.video_templates
  SET usage_count = COALESCE(usage_count, 0) + 1
  WHERE id = template_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_template_versions_template_id ON public.video_template_versions(template_id);
CREATE INDEX IF NOT EXISTS idx_templates_category ON public.video_templates(category);
CREATE INDEX IF NOT EXISTS idx_templates_tags ON public.video_templates USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_templates_featured ON public.video_templates(is_featured) WHERE is_featured = true;