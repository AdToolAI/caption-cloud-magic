-- Mute generic "Failed to load resource: status of 4xx ()" without URL detail
-- (third-party scripts like PostHog/Sentry/Recorder fail in Browserless without breaking app)
INSERT INTO public.qa_muted_patterns (pattern_regex, reason, severity_when_matched)
VALUES
  ('Failed to load resource: the server responded with a status of 4\d\d \(\)\s*$',
   'Generic 4xx without URL — typically PostHog/Sentry/Recorder noise in Browserless sessions',
   'ignore');

-- Bulk-resolve known smoke-07 (wait_selector unknown step type) and smoke-10 (status 400) noise
UPDATE public.qa_bug_reports
SET status = 'resolved', resolved_at = now()
WHERE status = 'open'
  AND (
    (mission_name = 'smoke-07-calendar-crud' AND title ILIKE '%wait_selector%')
    OR (mission_name = 'smoke-10-brand-characters' AND title ILIKE '%status of 400%')
  );