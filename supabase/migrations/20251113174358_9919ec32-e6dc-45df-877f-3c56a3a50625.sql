-- Phase 3.1: Index Optimization
-- Drop old indexes that will be replaced by more efficient composite indexes
DROP INDEX IF EXISTS idx_content_items_source_type;
DROP INDEX IF EXISTS idx_content_items_type_created;
DROP INDEX IF EXISTS idx_content_items_title_trgm;
DROP INDEX IF EXISTS idx_content_items_caption_trgm;

-- Create new composite index that matches our most common query pattern
-- This index covers: workspace_id + type + source + created_at
-- Supports queries filtering by workspace_id (always present), optionally type, optionally source
CREATE INDEX IF NOT EXISTS idx_content_items_workspace_type_source_created 
ON content_items(workspace_id, type, source, created_at DESC);

-- Create new case-insensitive trigram indexes for text search
-- Using lower() with gin_trgm_ops for better performance with ILIKE queries
CREATE INDEX IF NOT EXISTS idx_content_items_title_lower_trgm 
ON content_items USING gin(lower(title) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_content_items_caption_lower_trgm 
ON content_items USING gin(lower(caption) gin_trgm_ops);

-- Update statistics for query planner
ANALYZE content_items;