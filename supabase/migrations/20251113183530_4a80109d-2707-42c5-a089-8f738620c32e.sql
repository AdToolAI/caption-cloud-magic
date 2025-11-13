-- Phase 3.3: Index Rollback - Drop unused covering index
-- The idx_content_items_workspace_tags_created was barely used (10 scans vs 183k on workspace_created)
-- Revert to proven index strategy that actually gets used by query planner

DROP INDEX IF EXISTS idx_content_items_workspace_tags_created;

-- Keep proven indexes that are actively used:
-- - idx_content_items_workspace_created (183,335 scans)
-- - idx_content_items_tags_gin (for array overlaps)
-- - Text search indexes (title_lower_trgm, caption_lower_trgm)

-- Update statistics for query planner
ANALYZE content_items;