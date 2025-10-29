-- Add index for dispatcher queries (now that enum values are committed)
CREATE INDEX IF NOT EXISTS idx_calendar_events_scheduled_publish 
  ON calendar_events(workspace_id, status, start_at) 
  WHERE status IN ('scheduled', 'failed');

-- Add INSERT policy for calendar_publish_logs (service role can insert logs)
CREATE POLICY "Service role can insert logs"
  ON calendar_publish_logs FOR INSERT
  WITH CHECK (true);