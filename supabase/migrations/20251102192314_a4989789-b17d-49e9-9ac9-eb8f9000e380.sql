-- ============================================================
-- WEEK 1: Rate-Limiting + Job-Queue System (Fixed)
-- Production Hardening for 1000+ Users
-- ============================================================

-- 1. Plan-based Rate Limit Configuration
CREATE TABLE IF NOT EXISTS plan_rate_limits (
  plan_code TEXT PRIMARY KEY,
  ai_calls_per_minute INTEGER NOT NULL,
  concurrent_ai_jobs INTEGER NOT NULL,
  api_calls_per_minute INTEGER NOT NULL,
  storage_quota_mb INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default limits for each plan
INSERT INTO plan_rate_limits (plan_code, ai_calls_per_minute, concurrent_ai_jobs, api_calls_per_minute, storage_quota_mb) VALUES
  ('free', 5, 1, 50, 1024),
  ('basic', 15, 3, 150, 2048),
  ('pro', 30, 5, 300, 5120),
  ('enterprise', 999999, 20, 999999, 10240)
ON CONFLICT (plan_code) DO NOTHING;

-- 2. Rate Limit State Tracker (per user/workspace)
CREATE TABLE IF NOT EXISTS rate_limit_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('user', 'workspace')),
  entity_id UUID NOT NULL,
  limit_type TEXT NOT NULL CHECK (limit_type IN ('ai_calls', 'api_calls')),
  tokens_remaining INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  last_refill_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(entity_type, entity_id, limit_type, window_start)
);

CREATE INDEX idx_rate_limit_state_lookup ON rate_limit_state(entity_type, entity_id, limit_type, window_end);
CREATE INDEX idx_rate_limit_state_cleanup ON rate_limit_state(window_end);

-- 3. Active AI Jobs Tracker (for concurrent job limits)
CREATE TABLE IF NOT EXISTS active_ai_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  job_id UUID NOT NULL,
  job_type TEXT NOT NULL,
  started_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(job_id)
);

CREATE INDEX idx_active_ai_jobs_user ON active_ai_jobs(user_id);
CREATE INDEX idx_active_ai_jobs_workspace ON active_ai_jobs(workspace_id);
CREATE INDEX idx_active_ai_jobs_cleanup ON active_ai_jobs(started_at);

-- 4. AI Jobs Queue (for async processing)
CREATE TABLE IF NOT EXISTS ai_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,
  priority INTEGER DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  input_data JSONB NOT NULL,
  result_data JSONB,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  next_retry_at TIMESTAMPTZ,
  processing_started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for efficient queue processing
CREATE INDEX idx_ai_jobs_pending ON ai_jobs(status, priority ASC, created_at ASC);
CREATE INDEX idx_ai_jobs_user_recent ON ai_jobs(user_id, created_at DESC);
CREATE INDEX idx_ai_jobs_workspace ON ai_jobs(workspace_id, created_at DESC);
CREATE INDEX idx_ai_jobs_retry ON ai_jobs(next_retry_at ASC);
CREATE INDEX idx_ai_jobs_processing ON ai_jobs(processing_started_at);
CREATE INDEX idx_ai_jobs_cleanup ON ai_jobs(completed_at, status);

-- 5. Trigger for ai_jobs updated_at
CREATE OR REPLACE FUNCTION update_ai_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS ai_jobs_updated_at_trigger ON ai_jobs;
CREATE TRIGGER ai_jobs_updated_at_trigger
  BEFORE UPDATE ON ai_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_jobs_updated_at();

-- 6. Function to cleanup old rate limit states (run via cron)
CREATE OR REPLACE FUNCTION cleanup_old_rate_limit_states()
RETURNS void AS $$
BEGIN
  DELETE FROM rate_limit_state
  WHERE window_end < now() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 7. Function to cleanup old completed AI jobs (run via cron)
CREATE OR REPLACE FUNCTION cleanup_old_ai_jobs()
RETURNS void AS $$
BEGIN
  DELETE FROM ai_jobs
  WHERE status IN ('completed', 'failed')
    AND completed_at < now() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 8. Function to cleanup stale active_ai_jobs (jobs stuck for >1 hour)
CREATE OR REPLACE FUNCTION cleanup_stale_active_jobs()
RETURNS void AS $$
BEGIN
  DELETE FROM active_ai_jobs
  WHERE started_at < now() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 9. Add plan column to profiles if not exists (for rate limiting)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'plan'
  ) THEN
    ALTER TABLE profiles ADD COLUMN plan TEXT DEFAULT 'free';
  END IF;
END $$;

-- 10. Enable RLS on new tables
ALTER TABLE plan_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_ai_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for plan_rate_limits (public read)
DROP POLICY IF EXISTS "plan_rate_limits_public_read" ON plan_rate_limits;
CREATE POLICY "plan_rate_limits_public_read" ON plan_rate_limits
  FOR SELECT USING (true);

-- RLS Policies for rate_limit_state (users can view their own)
DROP POLICY IF EXISTS "rate_limit_state_user_select" ON rate_limit_state;
CREATE POLICY "rate_limit_state_user_select" ON rate_limit_state
  FOR SELECT USING (
    entity_type = 'user' AND entity_id = auth.uid()
  );

-- RLS Policies for active_ai_jobs (users can view their own)
DROP POLICY IF EXISTS "active_ai_jobs_user_select" ON active_ai_jobs;
CREATE POLICY "active_ai_jobs_user_select" ON active_ai_jobs
  FOR SELECT USING (user_id = auth.uid());

-- RLS Policies for ai_jobs (users can view and manage their own)
DROP POLICY IF EXISTS "ai_jobs_user_select" ON ai_jobs;
CREATE POLICY "ai_jobs_user_select" ON ai_jobs
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "ai_jobs_user_insert" ON ai_jobs;
CREATE POLICY "ai_jobs_user_insert" ON ai_jobs
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "ai_jobs_user_update" ON ai_jobs;
CREATE POLICY "ai_jobs_user_update" ON ai_jobs
  FOR UPDATE USING (user_id = auth.uid());