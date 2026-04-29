UPDATE public.qa_bug_reports
SET resolved_at = now(), status = 'resolved'
WHERE resolved_at IS NULL
  AND (
    mission_name IN (
      'smoke-01-dashboard-tour',
      'smoke-02-picture-studio-mock',
      'smoke-03-ai-video-toolkit',
      'smoke-07-calendar-crud',
      'smoke-08-music-studio'
    )
    OR title ILIKE '%companion_user_preferences%'
    OR title ILIKE '%icon-192.png%'
  );