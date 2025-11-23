-- Add metadata column to video_creations for AI video information
ALTER TABLE video_creations 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Enable Realtime for ai_video_generations table
ALTER PUBLICATION supabase_realtime 
ADD TABLE ai_video_generations;