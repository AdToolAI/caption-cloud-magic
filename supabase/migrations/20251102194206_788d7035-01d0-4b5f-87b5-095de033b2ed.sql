-- ============================================================
-- WEEK 2: Database Optimization - Critical Indexes Only
-- ============================================================

-- 1. CONTENT ITEMS
CREATE INDEX IF NOT EXISTS idx_content_items_workspace_created 
  ON content_items(workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_content_items_source 
  ON content_items(workspace_id, source, source_id) 
  WHERE source IS NOT NULL;

-- 2. CAMPAIGNS
CREATE INDEX IF NOT EXISTS idx_campaigns_user_created 
  ON campaigns(user_id, created_at DESC);

-- 3. CALENDAR EVENTS
CREATE INDEX IF NOT EXISTS idx_calendar_events_workspace_start
  ON calendar_events(workspace_id, start_at DESC);

CREATE INDEX IF NOT EXISTS idx_calendar_events_status 
  ON calendar_events(workspace_id, status, start_at);

-- 4. APP EVENTS  
CREATE INDEX IF NOT EXISTS idx_app_events_user_type_occurred 
  ON app_events(user_id, event_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_events_occurred 
  ON app_events(occurred_at DESC);

-- 5. SOCIAL CONNECTIONS
CREATE INDEX IF NOT EXISTS idx_social_connections_user_provider 
  ON social_connections(user_id, provider);

-- 6. WALLETS
CREATE INDEX IF NOT EXISTS idx_wallets_user 
  ON wallets(user_id);

-- 7. WORKSPACES  
CREATE INDEX IF NOT EXISTS idx_workspaces_owner 
  ON workspaces(owner_id, created_at DESC);

-- 8. WORKSPACE MEMBERS
CREATE INDEX IF NOT EXISTS idx_workspace_members_user 
  ON workspace_members(user_id, workspace_id);

CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace 
  ON workspace_members(workspace_id, role);

-- 9. BRAND KITS
CREATE INDEX IF NOT EXISTS idx_brand_kits_user 
  ON brand_kits(user_id, created_at DESC);

-- 10. PROFILES  
CREATE INDEX IF NOT EXISTS idx_profiles_plan
  ON profiles(plan)
  WHERE plan IS NOT NULL;

-- 11. COMMENTS
CREATE INDEX IF NOT EXISTS idx_comments_project_created
  ON comments(project_id, created_at_platform DESC);

-- 12. MEDIA LIBRARY
CREATE INDEX IF NOT EXISTS idx_media_library_user_created
  ON media_library(user_id, created_at DESC);

-- 13. AI JOBS
CREATE INDEX IF NOT EXISTS idx_ai_jobs_user_status
  ON ai_jobs(user_id, status, created_at DESC);