-- Phase 3.2: Index Cleanup and Focused Optimization
-- Drop inefficient/redundant indexes created in Phase 3.1
DROP INDEX IF EXISTS idx_content_items_workspace_type_source_created;
DROP INDEX IF EXISTS idx_content_items_workspace_tags;
DROP INDEX IF EXISTS idx_content_items_workspace;
DROP INDEX IF EXISTS idx_content_items_workspace_only;

-- Create optimized covering index for most common query pattern:
-- workspace_id + ORDER BY created_at + tags filtering
-- Using INCLUDE for covering index = faster index-only scans
CREATE INDEX IF NOT EXISTS idx_content_items_workspace_tags_created
ON content_items(workspace_id, created_at DESC)
INCLUDE (tags);

-- Update statistics for query planner
ANALYZE content_items;