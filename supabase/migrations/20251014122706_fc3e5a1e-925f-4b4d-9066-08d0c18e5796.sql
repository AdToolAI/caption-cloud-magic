-- Sprint 1 Part 1: Enums (ohne task_status da bereits vorhanden)

-- Calendar-specific roles
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'calendar_role') THEN
    CREATE TYPE calendar_role AS ENUM ('owner', 'account_manager', 'editor', 'approver', 'viewer');
  END IF;
END$$;

-- Extended event status
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'calendar_event_status') THEN
    CREATE TYPE calendar_event_status AS ENUM (
      'briefing',
      'in_progress',
      'review',
      'pending_approval',
      'approved',
      'scheduled',
      'published',
      'cancelled'
    );
  END IF;
END$$;

-- View types
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'calendar_view_type') THEN
    CREATE TYPE calendar_view_type AS ENUM ('month', 'week', 'list', 'kanban', 'timeline');
  END IF;
END$$;

-- Clients Table
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  logo_url TEXT,
  contact_email TEXT,
  contact_name TEXT,
  timezone TEXT NOT NULL DEFAULT 'Europe/Berlin',
  settings_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clients_workspace ON clients(workspace_id);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'clients' AND policyname = 'Workspace members can view clients') THEN
    CREATE POLICY "Workspace members can view clients"
      ON clients FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM workspace_members
          WHERE workspace_members.workspace_id = clients.workspace_id
          AND workspace_members.user_id = auth.uid()
        )
      );
  END IF;
END$$;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'clients' AND policyname = 'Workspace admins can manage clients') THEN
    CREATE POLICY "Workspace admins can manage clients"
      ON clients FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM workspace_members
          WHERE workspace_members.workspace_id = clients.workspace_id
          AND workspace_members.user_id = auth.uid()
          AND workspace_members.role IN ('owner', 'admin')
        )
      );
  END IF;
END$$;