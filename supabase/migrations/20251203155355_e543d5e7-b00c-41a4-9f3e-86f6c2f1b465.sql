-- Add missing render_config column to director_cut_renders table
ALTER TABLE director_cut_renders 
ADD COLUMN IF NOT EXISTS render_config jsonb DEFAULT '{}'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN director_cut_renders.render_config IS 'Full render configuration including voiceover, music, scenes, transitions, and all premium feature settings';