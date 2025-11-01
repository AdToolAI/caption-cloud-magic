-- Add file_size_mb column to content_items table for tracking exact file sizes
ALTER TABLE public.content_items 
ADD COLUMN file_size_mb NUMERIC DEFAULT 0;

-- Create index for performance when filtering/sorting by file size
CREATE INDEX idx_content_items_file_size 
ON public.content_items(file_size_mb);

-- Add comment for documentation
COMMENT ON COLUMN public.content_items.file_size_mb IS 'File size in megabytes. For AI-generated content, determined via HTTP HEAD request. For media library items, copied from media_assets.';