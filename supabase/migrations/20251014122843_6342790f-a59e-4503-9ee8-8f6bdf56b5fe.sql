-- Sprint 1 Part 2: Calendar Events und abhängige Tabellen

-- Calendar Events Table
CREATE TABLE IF NOT EXISTS calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  brand_kit_id UUID REFERENCES brand_kits(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  
  title TEXT NOT NULL,
  brief TEXT,
  caption TEXT,
  
  channels TEXT[] NOT NULL DEFAULT '{}',
  status calendar_event_status NOT NULL DEFAULT 'briefing',
  
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  timezone TEXT NOT NULL DEFAULT 'Europe/Berlin',
  
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assignees UUID[] DEFAULT '{}',
  eta_minutes INTEGER,
  
  assets_json JSONB DEFAULT '[]'::jsonb,
  hashtags TEXT[] DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  tags TEXT[] DEFAULT '{}',
  
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_workspace ON calendar_events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_client ON calendar_events(client_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_brand ON calendar_events(brand_kit_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_start ON calendar_events(start_at);
CREATE INDEX IF NOT EXISTS idx_calendar_events_status ON calendar_events(status);
CREATE INDEX IF NOT EXISTS idx_calendar_events_campaign ON calendar_events(campaign_id);

ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'calendar_events' AND policyname = 'Workspace members can view events') THEN
    CREATE POLICY "Workspace members can view events"
      ON calendar_events FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM workspace_members
          WHERE workspace_members.workspace_id = calendar_events.workspace_id
          AND workspace_members.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'calendar_events' AND policyname = 'Editors can create events') THEN
    CREATE POLICY "Editors can create events"
      ON calendar_events FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM workspace_members
          WHERE workspace_members.workspace_id = calendar_events.workspace_id
          AND workspace_members.user_id = auth.uid()
          AND workspace_members.role IN ('owner', 'admin', 'editor')
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'calendar_events' AND policyname = 'Editors can update events') THEN
    CREATE POLICY "Editors can update events"
      ON calendar_events FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM workspace_members
          WHERE workspace_members.workspace_id = calendar_events.workspace_id
          AND workspace_members.user_id = auth.uid()
          AND workspace_members.role IN ('owner', 'admin', 'editor')
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'calendar_events' AND policyname = 'Editors can delete events') THEN
    CREATE POLICY "Editors can delete events"
      ON calendar_events FOR DELETE
      USING (
        EXISTS (
          SELECT 1 FROM workspace_members
          WHERE workspace_members.workspace_id = calendar_events.workspace_id
          AND workspace_members.user_id = auth.uid()
          AND workspace_members.role IN ('owner', 'admin', 'editor')
        )
      );
  END IF;
END$$;

-- Approvals Table
CREATE TABLE IF NOT EXISTS calendar_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  
  approver_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approver_email TEXT,
  
  status TEXT NOT NULL DEFAULT 'pending',
  comment TEXT,
  
  review_token TEXT UNIQUE,
  token_expires_at TIMESTAMPTZ,
  
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approvals_event ON calendar_approvals(event_id);
CREATE INDEX IF NOT EXISTS idx_approvals_token ON calendar_approvals(review_token);

ALTER TABLE calendar_approvals ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'calendar_approvals' AND policyname = 'Workspace members can view approvals') THEN
    CREATE POLICY "Workspace members can view approvals"
      ON calendar_approvals FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM calendar_events
          JOIN workspace_members ON workspace_members.workspace_id = calendar_events.workspace_id
          WHERE calendar_events.id = calendar_approvals.event_id
          AND workspace_members.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'calendar_approvals' AND policyname = 'Public can view with valid token') THEN
    CREATE POLICY "Public can view with valid token"
      ON calendar_approvals FOR SELECT
      USING (
        review_token IS NOT NULL
        AND token_expires_at > now()
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'calendar_approvals' AND policyname = 'Public can update with valid token') THEN
    CREATE POLICY "Public can update with valid token"
      ON calendar_approvals FOR UPDATE
      USING (
        review_token IS NOT NULL
        AND token_expires_at > now()
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'calendar_approvals' AND policyname = 'Workspace members can create approvals') THEN
    CREATE POLICY "Workspace members can create approvals"
      ON calendar_approvals FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM calendar_events
          JOIN workspace_members ON workspace_members.workspace_id = calendar_events.workspace_id
          WHERE calendar_events.id = calendar_approvals.event_id
          AND workspace_members.user_id = auth.uid()
        )
      );
  END IF;
END$$;

-- Tasks Table
CREATE TABLE IF NOT EXISTS calendar_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  
  title TEXT NOT NULL,
  description TEXT,
  
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  status task_status NOT NULL DEFAULT 'todo',
  priority INTEGER NOT NULL DEFAULT 1,
  
  due_at TIMESTAMPTZ,
  estimate_minutes INTEGER,
  
  parent_task_id UUID REFERENCES calendar_tasks(id) ON DELETE CASCADE,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_event ON calendar_tasks(event_id);
CREATE INDEX IF NOT EXISTS idx_tasks_owner ON calendar_tasks(owner_id);

ALTER TABLE calendar_tasks ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'calendar_tasks' AND policyname = 'Workspace members can view tasks') THEN
    CREATE POLICY "Workspace members can view tasks"
      ON calendar_tasks FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM calendar_events
          JOIN workspace_members ON workspace_members.workspace_id = calendar_events.workspace_id
          WHERE calendar_events.id = calendar_tasks.event_id
          AND workspace_members.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'calendar_tasks' AND policyname = 'Workspace members can manage tasks') THEN
    CREATE POLICY "Workspace members can manage tasks"
      ON calendar_tasks FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM calendar_events
          JOIN workspace_members ON workspace_members.workspace_id = calendar_events.workspace_id
          WHERE calendar_events.id = calendar_tasks.event_id
          AND workspace_members.user_id = auth.uid()
        )
      );
  END IF;
END$$;

-- Capacity Table
CREATE TABLE IF NOT EXISTS user_capacity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  
  week_start DATE NOT NULL,
  available_minutes INTEGER NOT NULL DEFAULT 2400,
  notes TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(user_id, workspace_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_capacity_user_workspace ON user_capacity(user_id, workspace_id);
CREATE INDEX IF NOT EXISTS idx_capacity_week ON user_capacity(week_start);

ALTER TABLE user_capacity ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_capacity' AND policyname = 'Users can view own capacity') THEN
    CREATE POLICY "Users can view own capacity"
      ON user_capacity FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_capacity' AND policyname = 'Users can manage own capacity') THEN
    CREATE POLICY "Users can manage own capacity"
      ON user_capacity FOR ALL
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_capacity' AND policyname = 'Workspace admins can view all capacity') THEN
    CREATE POLICY "Workspace admins can view all capacity"
      ON user_capacity FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM workspace_members
          WHERE workspace_members.workspace_id = user_capacity.workspace_id
          AND workspace_members.user_id = auth.uid()
          AND workspace_members.role IN ('owner', 'admin')
        )
      );
  END IF;
END$$;