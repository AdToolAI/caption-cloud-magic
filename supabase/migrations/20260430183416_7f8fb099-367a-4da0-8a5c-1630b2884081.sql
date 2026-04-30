UPDATE public.qa_bug_reports
SET status = 'resolved',
    resolved_at = now()
WHERE status = 'open'
  AND mission_name = 'smoke-07-calendar-crud'
  AND title ILIKE '%wait_selector%';