-- Phase 3: Database Query Performance Optimization
-- Add composite indexes for common query patterns in planner-list

-- Enable pg_trgm extension FIRST for better text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Pattern 1: type + source + workspace_id (most specific)
CREATE INDEX IF NOT EXISTS idx_content_items_type_source_created 
ON content_items(workspace_id, type, source, created_at DESC);

-- Pattern 2: type + workspace_id only
CREATE INDEX IF NOT EXISTS idx_content_items_type_created 
ON content_items(workspace_id, type, created_at DESC);

-- Pattern 3: Full-text search on title and caption using trigram
CREATE INDEX IF NOT EXISTS idx_content_items_title_trgm 
ON content_items USING GIN (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_content_items_caption_trgm 
ON content_items USING GIN (caption gin_trgm_ops);

-- Pattern 4: Tags array overlap (separate from workspace_id)
CREATE INDEX IF NOT EXISTS idx_content_items_tags_gin 
ON content_items USING GIN (tags);

-- Standard B-tree index for workspace filtering with tags
CREATE INDEX IF NOT EXISTS idx_content_items_workspace_tags 
ON content_items(workspace_id, tags);

-- Add index for counting total records efficiently
CREATE INDEX IF NOT EXISTS idx_content_items_workspace_only 
ON content_items(workspace_id) 
WHERE workspace_id IS NOT NULL;