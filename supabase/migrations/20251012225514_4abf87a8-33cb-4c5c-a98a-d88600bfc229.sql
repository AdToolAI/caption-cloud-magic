-- Add language field to comment_analysis table
ALTER TABLE public.comment_analysis 
ADD COLUMN IF NOT EXISTS language text;