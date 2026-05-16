
-- Restrict calendar_integrations SELECT to workspace admins/owners only
-- (table contains google_refresh_token and slack_webhook_url — sensitive credentials)
DROP POLICY IF EXISTS "Workspace members can view integrations" ON public.calendar_integrations;

CREATE POLICY "Workspace admins can view integrations"
  ON public.calendar_integrations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = calendar_integrations.workspace_id
        AND workspace_members.user_id = auth.uid()
        AND workspace_members.role = ANY (ARRAY['owner'::team_role, 'admin'::team_role])
    )
  );

-- Restrict webhook_endpoints: split the catch-all admin policy so SELECT is service_role only
-- (the `secret` column is used to sign outgoing payloads and must never be readable from client)
DROP POLICY IF EXISTS "Admins can manage webhooks" ON public.webhook_endpoints;

CREATE POLICY "Service role can read webhooks"
  ON public.webhook_endpoints
  FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "Admins can insert webhooks"
  ON public.webhook_endpoints
  FOR INSERT
  WITH CHECK (is_workspace_admin(workspace_id, auth.uid()));

CREATE POLICY "Admins can update webhooks"
  ON public.webhook_endpoints
  FOR UPDATE
  USING (is_workspace_admin(workspace_id, auth.uid()))
  WITH CHECK (is_workspace_admin(workspace_id, auth.uid()));

CREATE POLICY "Admins can delete webhooks"
  ON public.webhook_endpoints
  FOR DELETE
  USING (is_workspace_admin(workspace_id, auth.uid()));
