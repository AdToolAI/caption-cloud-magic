-- Fix campaign_posts.created_at to auto-generate timestamp
-- This resolves the "column created_at does not exist" error in generate-campaign
ALTER TABLE campaign_posts 
ALTER COLUMN created_at SET DEFAULT now();