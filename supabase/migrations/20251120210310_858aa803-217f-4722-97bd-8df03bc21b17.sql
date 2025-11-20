-- Add content_type and required fields to content_templates
ALTER TABLE content_templates 
ADD COLUMN IF NOT EXISTS content_type TEXT CHECK (content_type IN ('ad', 'story', 'reel', 'tutorial', 'testimonial', 'news')),
ADD COLUMN IF NOT EXISTS aspect_ratios TEXT[] DEFAULT ARRAY['9:16'],
ADD COLUMN IF NOT EXISTS platforms TEXT[] DEFAULT ARRAY['instagram', 'tiktok'],
ADD COLUMN IF NOT EXISTS duration_min INTEGER DEFAULT 10,
ADD COLUMN IF NOT EXISTS duration_max INTEGER DEFAULT 15,
ADD COLUMN IF NOT EXISTS customizable_fields JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS ai_features TEXT[] DEFAULT ARRAY['script_generation', 'voiceover'],
ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS usage_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT true;

-- Create index for faster content_type queries
CREATE INDEX IF NOT EXISTS idx_content_templates_content_type ON content_templates(content_type);
CREATE INDEX IF NOT EXISTS idx_content_templates_featured ON content_templates(is_featured) WHERE is_featured = true;

-- Update existing RLS policies to allow public read for public templates
DROP POLICY IF EXISTS "Public templates are viewable by everyone" ON content_templates;
CREATE POLICY "Public templates are viewable by everyone" 
ON content_templates FOR SELECT 
USING (is_public = true OR created_by = auth.uid());

-- Allow authenticated users to create templates
DROP POLICY IF EXISTS "Users can create templates" ON content_templates;
CREATE POLICY "Users can create templates" 
ON content_templates FOR INSERT 
WITH CHECK (auth.uid() = created_by);

-- Users can update own templates
DROP POLICY IF EXISTS "Users can update own templates" ON content_templates;
CREATE POLICY "Users can update own templates" 
ON content_templates FOR UPDATE 
USING (auth.uid() = created_by);