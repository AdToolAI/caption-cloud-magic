-- ============================================
-- Phase 3: Performance Optimization Indexes
-- Target: 500 → 1000 concurrent users  
-- ============================================

-- 1. Content Planner List Performance
-- Optimizes: planner-list edge function
CREATE INDEX IF NOT EXISTS idx_content_items_workspace_type_created 
ON content_items(workspace_id, type, created_at DESC);

-- 2. Content Items Full Query Performance
CREATE INDEX IF NOT EXISTS idx_content_items_workspace_created 
ON content_items(workspace_id, created_at DESC);

-- 3. Calendar Timeline View
CREATE INDEX IF NOT EXISTS idx_calendar_events_workspace_date 
ON calendar_events(workspace_id, start_at);

-- 4. Calendar Event Status Queries
CREATE INDEX IF NOT EXISTS idx_calendar_events_status_date 
ON calendar_events(status, start_at);

-- 5. AI Queue Worker Performance
CREATE INDEX IF NOT EXISTS idx_ai_jobs_status_priority_created 
ON ai_jobs(status, priority DESC, created_at ASC);

-- 6. Schedule Blocks by Weekplan
CREATE INDEX IF NOT EXISTS idx_schedule_blocks_weekplan_status 
ON schedule_blocks(weekplan_id, status);

-- 7. Campaigns by User
CREATE INDEX IF NOT EXISTS idx_campaigns_user_created 
ON campaigns(user_id, created_at DESC);

-- Analyze tables to update statistics
ANALYZE content_items;
ANALYZE campaigns;
ANALYZE calendar_events;
ANALYZE ai_jobs;
ANALYZE schedule_blocks;