-- Add media_title column to campaign_posts table
ALTER TABLE public.campaign_posts
ADD COLUMN IF NOT EXISTS media_title TEXT;