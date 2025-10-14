-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Workspace members can view clients" ON clients;
DROP POLICY IF EXISTS "Workspace admins can manage clients" ON clients;
DROP POLICY IF EXISTS "Users can view own capacity" ON user_capacity;
DROP POLICY IF EXISTS "Workspace admins can view all capacity" ON user_capacity;
DROP POLICY IF EXISTS "Users can update own capacity" ON user_capacity;
DROP POLICY IF EXISTS "Workspace admins can manage capacity" ON user_capacity;

-- Ensure tables exist (skip if exists)
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

-- Create indexes if not exists
CREATE INDEX IF NOT EXISTS idx_clients_workspace ON clients(workspace_id);
CREATE INDEX IF NOT EXISTS idx_user_capacity_user ON user_capacity(user_id);
CREATE INDEX IF NOT EXISTS idx_user_capacity_workspace ON user_capacity(workspace_id);
CREATE INDEX IF NOT EXISTS idx_user_capacity_week ON user_capacity(week_start);

-- Enable RLS
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_capacity ENABLE ROW LEVEL SECURITY;

-- Create fresh policies for clients
CREATE POLICY "wm_clients_view"
  ON clients FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = clients.workspace_id
      AND workspace_members.user_id = auth.uid()
    )
  );

CREATE POLICY "wm_clients_manage"
  ON clients FOR ALL
  USING (public.is_workspace_owner(workspace_id, auth.uid()));

-- Create fresh policies for user_capacity
CREATE POLICY "uc_view_own"
  ON user_capacity FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "uc_view_workspace"
  ON user_capacity FOR SELECT
  USING (public.is_workspace_owner(workspace_id, auth.uid()));

CREATE POLICY "uc_insert_own"
  ON user_capacity FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "uc_manage_workspace"
  ON user_capacity FOR ALL
  USING (public.is_workspace_owner(workspace_id, auth.uid()));