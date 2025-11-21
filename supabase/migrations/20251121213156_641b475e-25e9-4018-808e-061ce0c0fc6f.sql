-- Phase 17: Advanced Scheduling & Workflow
-- Video Integration, Enhanced Approvals, Bulk Scheduling, Notifications, Recurring Events

-- 1. Video Integration mit Calendar Events
ALTER TABLE calendar_events 
  ADD COLUMN IF NOT EXISTS video_project_id UUID REFERENCES content_projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS video_render_settings JSONB,
  ADD COLUMN IF NOT EXISTS auto_render BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_calendar_events_video_project ON calendar_events(video_project_id);

-- Rendering Queue für Calendar Events
CREATE TABLE IF NOT EXISTS calendar_render_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  project_id UUID REFERENCES content_projects(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'rendering', 'completed', 'failed')),
  render_url TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_render_queue_status ON calendar_render_queue(status);
CREATE INDEX IF NOT EXISTS idx_render_queue_event ON calendar_render_queue(event_id);

-- 2. Enhanced Approval Workflows
ALTER TABLE calendar_approvals
  ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT 'review' CHECK (stage IN ('review', 'final_approval', 'published')),
  ADD COLUMN IF NOT EXISTS approver_role TEXT,
  ADD COLUMN IF NOT EXISTS approved_changes JSONB;

CREATE TABLE IF NOT EXISTS approval_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  stages JSONB NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approval_workflows_workspace ON approval_workflows(workspace_id);

-- 3. Bulk Scheduling Jobs
CREATE TABLE IF NOT EXISTS bulk_schedule_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  total_events INTEGER NOT NULL,
  created_events INTEGER DEFAULT 0,
  config JSONB NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_bulk_schedule_workspace ON bulk_schedule_jobs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_bulk_schedule_status ON bulk_schedule_jobs(status);

-- 4. Notification System
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id UUID PRIMARY KEY,
  email_reminders BOOLEAN DEFAULT true,
  deadline_reminder_hours INTEGER DEFAULT 24,
  render_complete_notify BOOLEAN DEFAULT true,
  approval_request_notify BOOLEAN DEFAULT true,
  in_app_notifications BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('deadline', 'render_complete', 'approval_request', 'approval_approved', 'approval_rejected', 'recurring_event_created')),
  event_id UUID REFERENCES calendar_events(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT,
  metadata JSONB,
  read BOOLEAN DEFAULT false,
  sent_via_email BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notification_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notification_queue(read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notification_queue(created_at DESC);

-- 5. Recurring Event Rules
CREATE TABLE IF NOT EXISTS recurring_event_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  template_event JSONB NOT NULL,
  recurrence_pattern TEXT NOT NULL,
  auto_render BOOLEAN DEFAULT false,
  video_template_id UUID REFERENCES video_templates(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  next_execution TIMESTAMPTZ,
  last_execution TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recurring_rules_workspace ON recurring_event_rules(workspace_id);
CREATE INDEX IF NOT EXISTS idx_recurring_rules_active ON recurring_event_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_recurring_rules_next_execution ON recurring_event_rules(next_execution);

-- Enable RLS
ALTER TABLE calendar_render_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulk_schedule_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_event_rules ENABLE ROW LEVEL SECURITY;

-- RLS Policies: calendar_render_queue
CREATE POLICY "Users can view render queue for their workspace events"
  ON calendar_render_queue FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM calendar_events ce
      JOIN workspace_members wm ON wm.workspace_id = ce.workspace_id
      WHERE ce.id = calendar_render_queue.event_id
      AND wm.user_id = auth.uid()
    )
  );

-- RLS Policies: approval_workflows
CREATE POLICY "Users can view workflows in their workspace"
  ON approval_workflows FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = approval_workflows.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Workspace admins can manage workflows"
  ON approval_workflows FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = approval_workflows.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner', 'admin')
    )
  );

-- RLS Policies: bulk_schedule_jobs
CREATE POLICY "Users can view their bulk schedule jobs"
  ON bulk_schedule_jobs FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create bulk schedule jobs"
  ON bulk_schedule_jobs FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- RLS Policies: notification_preferences
CREATE POLICY "Users can manage their notification preferences"
  ON notification_preferences FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- RLS Policies: notification_queue
CREATE POLICY "Users can view their notifications"
  ON notification_queue FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update their notifications"
  ON notification_queue FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- RLS Policies: recurring_event_rules
CREATE POLICY "Users can view recurring rules in their workspace"
  ON recurring_event_rules FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = recurring_event_rules.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Workspace admins can manage recurring rules"
  ON recurring_event_rules FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = recurring_event_rules.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner', 'admin')
    )
  );

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_approval_workflows_updated_at
  BEFORE UPDATE ON approval_workflows
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_timestamp();

CREATE TRIGGER update_notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_timestamp();

CREATE TRIGGER update_recurring_event_rules_updated_at
  BEFORE UPDATE ON recurring_event_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_timestamp();