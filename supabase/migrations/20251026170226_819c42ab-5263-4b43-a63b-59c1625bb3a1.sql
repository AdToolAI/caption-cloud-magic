-- Add ai_output_json column to post_drafts table
ALTER TABLE public.post_drafts 
ADD COLUMN IF NOT EXISTS ai_output_json JSONB;