UPDATE public.qa_bug_reports
SET status = 'resolved', resolved_at = now()
WHERE status = 'open'
  AND title ILIKE '%Browserless 408%';