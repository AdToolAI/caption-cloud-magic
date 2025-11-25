-- Add bucket_name column to video_renders table
ALTER TABLE public.video_renders
ADD COLUMN IF NOT EXISTS bucket_name TEXT;