-- Extend video_templates for Phase 2 features
ALTER TABLE video_templates
ADD COLUMN IF NOT EXISTS has_audio BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS default_transition_style TEXT DEFAULT 'fade',
ADD COLUMN IF NOT EXISTS available_transitions TEXT[] DEFAULT ARRAY['fade', 'slide', 'zoom', 'wipe'];

COMMENT ON COLUMN video_templates.has_audio IS 'Whether this template supports background audio/music';
COMMENT ON COLUMN video_templates.default_transition_style IS 'Default transition style for this template';
COMMENT ON COLUMN video_templates.available_transitions IS 'Available transition styles for user selection';

-- Add brand_kit_id to video_creations for brand integration
ALTER TABLE video_creations
ADD COLUMN IF NOT EXISTS brand_kit_id UUID REFERENCES brand_kits(id) ON DELETE SET NULL;

COMMENT ON COLUMN video_creations.brand_kit_id IS 'Brand kit used for this video creation';

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_video_creations_brand_kit_id ON video_creations(brand_kit_id);

-- Update templates to support new features
UPDATE video_templates
SET 
  has_audio = true,
  supports_video = true,
  available_transitions = ARRAY['fade', 'slide', 'zoom']
WHERE name IN ('Product Showcase', 'Brand Story', 'Social Media Promo');