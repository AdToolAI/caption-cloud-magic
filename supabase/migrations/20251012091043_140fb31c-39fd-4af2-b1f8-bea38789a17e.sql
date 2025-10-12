-- Add publishing fields to existing posts table
ALTER TABLE public.posts 
ADD COLUMN IF NOT EXISTS published_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS external_post_id text,
ADD COLUMN IF NOT EXISTS error_message text,
ADD COLUMN IF NOT EXISTS media_urls jsonb DEFAULT '[]'::jsonb;

-- Add index for efficient querying of posts to publish
CREATE INDEX IF NOT EXISTS idx_posts_scheduled 
ON public.posts(scheduled_at) 
WHERE status = 'scheduled';

-- Add index for published posts
CREATE INDEX IF NOT EXISTS idx_posts_published 
ON public.posts(published_at DESC) 
WHERE status = 'posted';