-- Add versioning support to video_creations table
ALTER TABLE video_creations
ADD COLUMN parent_video_id UUID REFERENCES video_creations(id) ON DELETE SET NULL,
ADD COLUMN version_number INTEGER DEFAULT 1;

-- Create index for efficient version queries
CREATE INDEX idx_video_creations_parent ON video_creations(parent_video_id);

-- Add comment for documentation
COMMENT ON COLUMN video_creations.parent_video_id IS 'Reference to the original video if this is an edited version';
COMMENT ON COLUMN video_creations.version_number IS 'Version number of this video (1 = original, 2+ = edited versions)';