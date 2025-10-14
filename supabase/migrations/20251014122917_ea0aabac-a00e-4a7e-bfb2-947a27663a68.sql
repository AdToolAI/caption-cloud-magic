-- Sprint 1 Part 3: Remaining Tables (Blackout, Slots, Integrations, Comments, Activity, Templates)

-- Blackout Dates
CREATE TABLE IF NOT EXISTS calendar_blackout_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_kit_id UUID REFERENCES brand_kits(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  
  date DATE NOT NULL,
  all_day BOOLEAN NOT NULL DEFAULT true,
  start_time TIME,
  end_time TIME,
  
  note TEXT NOT NULL,
  reason TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blackout_workspace ON calendar_blackout_dates(workspace_id);
CREATE INDEX IF NOT EXISTS idx_blackout_brand ON calendar_blackout_dates(brand_kit_id);
CREATE INDEX IF NOT EXISTS idx_blackout_date ON calendar_blackout_dates(date);

ALTER TABLE calendar_blackout_dates ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'calendar_blackout_dates' AND policyname = 'Workspace members can view blackout dates') THEN
    CREATE POLICY "Workspace members can view blackout dates"
      ON calendar_blackout_dates FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM workspace_members
          WHERE workspace_members.workspace_id = calendar_blackout_dates.workspace_id
          AND workspace_members.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'calendar_blackout_dates' AND policyname = 'Workspace admins can manage blackout dates') THEN
    CREATE POLICY "Workspace admins can manage blackout dates"
      ON calendar_blackout_dates FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM workspace_members
          WHERE workspace_members.workspace_id = calendar_blackout_dates.workspace_id
          AND workspace_members.user_id = auth.uid()
          AND workspace_members.role IN ('owner', 'admin')
        )
      );
  END IF;
END$$;

-- Posting Slots
CREATE TABLE IF NOT EXISTS calendar_posting_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_kit_id UUID REFERENCES brand_kits(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  time_slot TIME NOT NULL,
  
  channels TEXT[],
  max_posts INTEGER DEFAULT 1,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_posting_slots_workspace ON calendar_posting_slots(workspace_id);
CREATE INDEX IF NOT EXISTS idx_posting_slots_brand ON calendar_posting_slots(brand_kit_id);

ALTER TABLE calendar_posting_slots ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'calendar_posting_slots' AND policyname = 'Workspace members can view posting slots') THEN
    CREATE POLICY "Workspace members can view posting slots"
      ON calendar_posting_slots FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM workspace_members
          WHERE workspace_members.workspace_id = calendar_posting_slots.workspace_id
          AND workspace_members.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'calendar_posting_slots' AND policyname = 'Workspace admins can manage posting slots') THEN
    CREATE POLICY "Workspace admins can manage posting slots"
      ON calendar_posting_slots FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM workspace_members
          WHERE workspace_members.workspace_id = calendar_posting_slots.workspace_id
          AND workspace_members.user_id = auth.uid()
          AND workspace_members.role IN ('owner', 'admin')
        )
      );
  END IF;
END$$;

-- Integrations
CREATE TABLE IF NOT EXISTS calendar_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  brand_kit_id UUID REFERENCES brand_kits(id) ON DELETE CASCADE,
  
  google_calendar_connected BOOLEAN DEFAULT false,
  google_calendar_id TEXT,
  google_sync_direction TEXT DEFAULT 'push',
  google_refresh_token TEXT,
  
  slack_webhook_url TEXT,
  slack_channel TEXT,
  
  holiday_region TEXT DEFAULT 'DE',
  
  settings_json JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(workspace_id, brand_kit_id)
);

CREATE INDEX IF NOT EXISTS idx_integrations_workspace ON calendar_integrations(workspace_id);

ALTER TABLE calendar_integrations ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'calendar_integrations' AND policyname = 'Workspace members can view integrations') THEN
    CREATE POLICY "Workspace members can view integrations"
      ON calendar_integrations FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM workspace_members
          WHERE workspace_members.workspace_id = calendar_integrations.workspace_id
          AND workspace_members.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'calendar_integrations' AND policyname = 'Workspace admins can manage integrations') THEN
    CREATE POLICY "Workspace admins can manage integrations"
      ON calendar_integrations FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM workspace_members
          WHERE workspace_members.workspace_id = calendar_integrations.workspace_id
          AND workspace_members.user_id = auth.uid()
          AND workspace_members.role IN ('owner', 'admin')
        )
      );
  END IF;
END$$;

-- Comments
CREATE TABLE IF NOT EXISTS calendar_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  username TEXT NOT NULL,
  
  comment_text TEXT NOT NULL,
  mentions UUID[] DEFAULT '{}',
  
  parent_comment_id UUID REFERENCES calendar_comments(id) ON DELETE CASCADE,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comments_event ON calendar_comments(event_id);
CREATE INDEX IF NOT EXISTS idx_comments_user ON calendar_comments(user_id);

ALTER TABLE calendar_comments ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'calendar_comments' AND policyname = 'Workspace members can view comments') THEN
    CREATE POLICY "Workspace members can view comments"
      ON calendar_comments FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM calendar_events
          JOIN workspace_members ON workspace_members.workspace_id = calendar_events.workspace_id
          WHERE calendar_events.id = calendar_comments.event_id
          AND workspace_members.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'calendar_comments' AND policyname = 'Workspace members can create comments') THEN
    CREATE POLICY "Workspace members can create comments"
      ON calendar_comments FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM calendar_events
          JOIN workspace_members ON workspace_members.workspace_id = calendar_events.workspace_id
          WHERE calendar_events.id = calendar_comments.event_id
          AND workspace_members.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'calendar_comments' AND policyname = 'Users can update own comments') THEN
    CREATE POLICY "Users can update own comments"
      ON calendar_comments FOR UPDATE
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'calendar_comments' AND policyname = 'Users can delete own comments') THEN
    CREATE POLICY "Users can delete own comments"
      ON calendar_comments FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END$$;

-- Activity Log
CREATE TABLE IF NOT EXISTS calendar_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES calendar_events(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  username TEXT,
  
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  
  changes_json JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_workspace ON calendar_activity_log(workspace_id);
CREATE INDEX IF NOT EXISTS idx_activity_event ON calendar_activity_log(event_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON calendar_activity_log(created_at DESC);

ALTER TABLE calendar_activity_log ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'calendar_activity_log' AND policyname = 'Workspace members can view activity log') THEN
    CREATE POLICY "Workspace members can view activity log"
      ON calendar_activity_log FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM workspace_members
          WHERE workspace_members.workspace_id = calendar_activity_log.workspace_id
          AND workspace_members.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'calendar_activity_log' AND policyname = 'Workspace members can create activity log') THEN
    CREATE POLICY "Workspace members can create activity log"
      ON calendar_activity_log FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM workspace_members
          WHERE workspace_members.workspace_id = calendar_activity_log.workspace_id
          AND workspace_members.user_id = auth.uid()
        )
      );
  END IF;
END$$;

-- Campaign Templates
CREATE TABLE IF NOT EXISTS calendar_campaign_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,
  template_type TEXT NOT NULL,
  
  duration_days INTEGER NOT NULL,
  events_json JSONB NOT NULL,
  
  description TEXT,
  is_public BOOLEAN DEFAULT false,
  
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_templates_workspace ON calendar_campaign_templates(workspace_id);
CREATE INDEX IF NOT EXISTS idx_templates_type ON calendar_campaign_templates(template_type);

ALTER TABLE calendar_campaign_templates ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'calendar_campaign_templates' AND policyname = 'Workspace members can view templates') THEN
    CREATE POLICY "Workspace members can view templates"
      ON calendar_campaign_templates FOR SELECT
      USING (
        workspace_id IS NULL OR
        EXISTS (
          SELECT 1 FROM workspace_members
          WHERE workspace_members.workspace_id = calendar_campaign_templates.workspace_id
          AND workspace_members.user_id = auth.uid()
        ) OR
        is_public = true
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'calendar_campaign_templates' AND policyname = 'Workspace members can create templates') THEN
    CREATE POLICY "Workspace members can create templates"
      ON calendar_campaign_templates FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM workspace_members
          WHERE workspace_members.workspace_id = calendar_campaign_templates.workspace_id
          AND workspace_members.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'calendar_campaign_templates' AND policyname = 'Template creators can update own templates') THEN
    CREATE POLICY "Template creators can update own templates"
      ON calendar_campaign_templates FOR UPDATE
      USING (auth.uid() = created_by);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'calendar_campaign_templates' AND policyname = 'Template creators can delete own templates') THEN
    CREATE POLICY "Template creators can delete own templates"
      ON calendar_campaign_templates FOR DELETE
      USING (auth.uid() = created_by);
  END IF;
END$$;