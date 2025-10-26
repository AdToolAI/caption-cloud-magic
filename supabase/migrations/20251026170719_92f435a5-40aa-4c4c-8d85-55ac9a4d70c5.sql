-- Add utm_link column to post_drafts table
ALTER TABLE public.post_drafts 
ADD COLUMN IF NOT EXISTS utm_link TEXT;