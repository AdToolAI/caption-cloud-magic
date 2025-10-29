-- Phase 1.1: Extend calendar_events table for automated publishing
ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS publish_results JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS error JSONB,
  ADD COLUMN IF NOT EXISTS attempt_no INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_by TEXT,
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- Add new status values to calendar_event_status enum (these will be committed before use)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'calendar_event_status' AND e.enumlabel = 'failed') THEN
    ALTER TYPE calendar_event_status ADD VALUE 'failed';
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'calendar_event_status' AND e.enumlabel = 'queued') THEN
    ALTER TYPE calendar_event_status ADD VALUE 'queued';
  END IF;
END $$;

-- Phase 1.2: Create calendar_publish_logs table
CREATE TABLE IF NOT EXISTS calendar_publish_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  level TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error')),
  message TEXT NOT NULL,
  meta JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_calendar_publish_logs_event ON calendar_publish_logs(event_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_calendar_publish_logs_workspace ON calendar_publish_logs(workspace_id, at DESC);

ALTER TABLE calendar_publish_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view logs for workspace events"
  ON calendar_publish_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = calendar_publish_logs.workspace_id
      AND workspace_members.user_id = auth.uid()
    )
  );

-- Phase 1.3: Create platform_limits configuration table
CREATE TABLE IF NOT EXISTS platform_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL UNIQUE,
  max_caption_length INTEGER,
  max_hashtags INTEGER,
  max_media_count INTEGER,
  supported_ratios TEXT[] DEFAULT '{}',
  rate_limit_per_hour INTEGER,
  config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed default platform limits
INSERT INTO platform_limits (platform, max_caption_length, max_hashtags, max_media_count, supported_ratios, rate_limit_per_hour) VALUES
  ('instagram', 2200, 30, 10, ARRAY['1:1', '4:5', '9:16', '16:9'], 25),
  ('tiktok', 2200, 30, 1, ARRAY['9:16'], 10),
  ('facebook', 63206, 100, 10, ARRAY['1:1', '4:5', '16:9'], 50),
  ('x', 280, 30, 4, ARRAY['1:1', '16:9'], 50),
  ('linkedin', 3000, 30, 9, ARRAY['1:1', '16:9'], 20),
  ('youtube', 100, 30, 1, ARRAY['9:16'], 10)
ON CONFLICT (platform) DO NOTHING;

ALTER TABLE platform_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read platform limits"
  ON platform_limits FOR SELECT
  USING (true);