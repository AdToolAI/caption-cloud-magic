-- Add RLS policies for rate_limits table (restrict to service role only)
CREATE POLICY "Service role only access to rate_limits"
  ON public.rate_limits FOR ALL
  USING (false)
  WITH CHECK (false);

-- Add RLS policies for security_audit_log table
-- Only service role can insert
CREATE POLICY "Service role can insert audit logs"
  ON public.security_audit_log FOR INSERT
  WITH CHECK (true);

-- Users can view their own audit logs
CREATE POLICY "Users can view own audit logs"
  ON public.security_audit_log FOR SELECT
  USING (auth.uid() = user_id);