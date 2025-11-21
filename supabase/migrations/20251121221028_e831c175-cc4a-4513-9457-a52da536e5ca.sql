-- Add remotion_component_id to content_templates
ALTER TABLE content_templates 
ADD COLUMN remotion_component_id TEXT;

-- Create enum for available Remotion components
CREATE TYPE remotion_component_type AS ENUM (
  'ProductAd',
  'InstagramStory', 
  'TikTokReel',
  'Testimonial',
  'Tutorial',
  'UniversalVideo'
);

-- Create template field mappings table
CREATE TABLE template_field_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES content_templates(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  remotion_prop_name TEXT NOT NULL,
  transformation_function TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(template_id, field_key)
);

-- Enable RLS on template_field_mappings
ALTER TABLE template_field_mappings ENABLE ROW LEVEL SECURITY;

-- Allow public read access to field mappings
CREATE POLICY "Anyone can view template field mappings"
  ON template_field_mappings
  FOR SELECT
  USING (true);

-- Create index for faster lookups
CREATE INDEX idx_template_field_mappings_template_id 
  ON template_field_mappings(template_id);

-- Add comments for documentation
COMMENT ON COLUMN content_templates.remotion_component_id IS 'ID of the Remotion component to use for rendering this template';
COMMENT ON TABLE template_field_mappings IS 'Maps template customizable fields to Remotion component props';
COMMENT ON COLUMN template_field_mappings.transformation_function IS 'Optional: name of transformation function to apply (e.g., "color_to_hex")';