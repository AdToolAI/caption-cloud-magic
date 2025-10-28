-- Add media_type column for image/video support
ALTER TABLE public.post_drafts 
ADD COLUMN IF NOT EXISTS media_type TEXT 
DEFAULT 'image' 
CHECK (media_type IN ('image', 'video'));

-- Add media_url column to replace image_url for videos
ALTER TABLE public.post_drafts 
ADD COLUMN IF NOT EXISTS media_url TEXT;

-- Migrate existing image_url values to media_url for backwards compatibility
UPDATE public.post_drafts 
SET media_url = image_url 
WHERE media_url IS NULL AND image_url IS NOT NULL;

-- Add documentation comments
COMMENT ON COLUMN public.post_drafts.media_type IS 'Type of media: image or video';
COMMENT ON COLUMN public.post_drafts.media_url IS 'URL to media file (image or video)';