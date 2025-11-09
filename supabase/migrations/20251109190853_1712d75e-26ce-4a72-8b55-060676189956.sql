
-- ============================================
-- Phase 1: Performance Optimizations
-- Database Indexes for High-Traffic Queries
-- ============================================

-- 1. Add GIN index for tags array searches (content_items)
CREATE INDEX IF NOT EXISTS idx_content_items_tags 
ON content_items USING GIN (tags);

-- 2. Add composite index for filtering by type and created_at
CREATE INDEX IF NOT EXISTS idx_content_items_type_created 
ON content_items (workspace_id, type, created_at DESC);

-- 3. Add index for source filtering (optimize planner-list queries)
CREATE INDEX IF NOT EXISTS idx_content_items_source_type 
ON content_items (workspace_id, source, type);

-- 4. Add composite index for calendar queries with date range
CREATE INDEX IF NOT EXISTS idx_calendar_events_date_range 
ON calendar_events (workspace_id, start_at, status) 
WHERE status IN ('scheduled', 'published');

-- 5. Add index for settings queries (cached frequently)
CREATE INDEX IF NOT EXISTS idx_settings_key 
ON settings (key);

-- 6. Add covering index for rate_limit_state queries
CREATE INDEX IF NOT EXISTS idx_rate_limit_state_lookup
ON rate_limit_state (entity_type, entity_id, limit_type, window_start, window_end)
INCLUDE (tokens_remaining);

-- 7. Add index for active_ai_jobs cleanup queries
CREATE INDEX IF NOT EXISTS idx_active_ai_jobs_started
ON active_ai_jobs (started_at);

-- ============================================
-- Performance Comments
-- ============================================
COMMENT ON INDEX idx_content_items_tags IS 'GIN index for fast array containment searches on tags';
COMMENT ON INDEX idx_content_items_type_created IS 'Composite index for filtered pagination queries';
COMMENT ON INDEX idx_rate_limit_state_lookup IS 'Covering index to avoid heap lookups in rate limiting';
