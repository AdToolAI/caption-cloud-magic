-- Add reshares column to post_metrics for LinkedIn analytics
ALTER TABLE post_metrics 
ADD COLUMN IF NOT EXISTS reshares integer DEFAULT 0;