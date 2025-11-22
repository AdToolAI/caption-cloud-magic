-- Add scenes JSONB column to content_projects for multi-scene video support
ALTER TABLE content_projects
ADD COLUMN IF NOT EXISTS scenes JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN content_projects.scenes IS 'Array of video scenes with individual backgrounds, durations, and transitions';

-- Example structure:
-- {
--   "scenes": [
--     {
--       "id": "scene_1",
--       "order": 0,
--       "duration": 5,
--       "background": {
--         "type": "video",
--         "url": "..."
--       },
--       "transition": {
--         "type": "fade",
--         "duration": 0.5
--       }
--     }
--   ]
-- }