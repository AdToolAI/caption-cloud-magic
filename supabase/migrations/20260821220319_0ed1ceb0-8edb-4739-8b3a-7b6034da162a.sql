select cron.schedule(
  'dispatch-scheduled-publications',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url:='https://lbunafpxuskwmsrraqxl.supabase.co/functions/v1/check-scheduled-publications',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxidW5hZnB4dXNrd21zcnJhcXhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAxMjA3NzUsImV4cCI6MjA3NTY5Njc3NX0.gRvY8kUzrELzlhSdGNJj_CXsaT8mqaUO7F1jCEi2T7Y"}'::jsonb,
    body:='{}'::jsonb
  );
  $$
);