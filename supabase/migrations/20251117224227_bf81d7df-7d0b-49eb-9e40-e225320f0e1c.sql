-- Add media_assets column to video_creations for multi-media support
ALTER TABLE video_creations 
ADD COLUMN IF NOT EXISTS media_assets JSONB DEFAULT '[]';

COMMENT ON COLUMN video_creations.media_assets IS 'Array of media assets: [{ type: "image"|"video", url: string, order: number, field_key: string }]';

-- Extend video_templates for multi-image support
ALTER TABLE video_templates
ADD COLUMN IF NOT EXISTS preview_video_url TEXT,
ADD COLUMN IF NOT EXISTS supports_multiple_images BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS max_image_count INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS supports_video BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

COMMENT ON COLUMN video_templates.supports_multiple_images IS 'Whether this template supports multiple images';
COMMENT ON COLUMN video_templates.max_image_count IS 'Maximum number of images allowed for this template';

-- Update existing templates to support multiple images
UPDATE video_templates
SET 
  supports_multiple_images = true,
  max_image_count = 5
WHERE name IN ('Product Showcase', 'Brand Story', 'Social Media Promo');

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_video_templates_tags ON video_templates USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_video_creations_media_assets ON video_creations USING GIN(media_assets);