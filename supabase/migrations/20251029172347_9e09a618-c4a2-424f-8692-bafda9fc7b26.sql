-- Enable realtime for calendar publishing tables
ALTER PUBLICATION supabase_realtime ADD TABLE calendar_events;
ALTER PUBLICATION supabase_realtime ADD TABLE calendar_publish_logs;