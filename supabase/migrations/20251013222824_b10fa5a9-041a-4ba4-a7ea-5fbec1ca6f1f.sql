-- Add columns to auto_post_queue for A/B testing and post content
ALTER TABLE public.auto_post_queue
ADD COLUMN IF NOT EXISTS draft_id UUID REFERENCES public.post_drafts(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS variant TEXT CHECK (variant IN ('A', 'B')),
ADD COLUMN IF NOT EXISTS hook TEXT,
ADD COLUMN IF NOT EXISTS caption TEXT,
ADD COLUMN IF NOT EXISTS hashtags JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS image_url TEXT,
ADD COLUMN IF NOT EXISTS alt_text TEXT,
ADD COLUMN IF NOT EXISTS utm_link TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_auto_post_queue_draft_id ON public.auto_post_queue(draft_id);
CREATE INDEX IF NOT EXISTS idx_auto_post_queue_scheduled_at ON public.auto_post_queue(scheduled_at) WHERE status = 'pending';