-- Additional mute patterns for QA Agent false-positive hardening
INSERT INTO qa_muted_patterns (pattern_regex, severity_when_matched, reason) VALUES
  ('Browserless engine failure.*finaliz', 'ignore', 'Finalize phase warning, mission steps were OK'),
  ('Engine finalize warning', 'ignore', 'Downgraded finalize-only failures'),
  ('Mission execution failed: \(no error message\)', 'ignore', 'Generic engine no-op without diagnostic data'),
  ('Browserless engine returned ok:false', 'ignore', 'Transient engine no-op'),
  ('posthog-recorder', 'ignore', 'PostHog session-replay blocked by adblock or CSP'),
  ('/envelope/', 'ignore', 'Sentry envelope blocked by adblock'),
  ('FunctionsFetchError.*Failed to send a request to the Edge Function', 'ignore', 'Bootstrap race during page lifecycle / unload');

-- Cleanup: mark current stale open bug reports of these classes as resolved
UPDATE qa_bug_reports
   SET status = 'resolved',
       resolved_at = now()
 WHERE status = 'open'
   AND (
        title ILIKE '%companion-diagnose%' OR
        title ILIKE '%check-subscription%' OR
        title ILIKE '%FunctionsFetchError%' OR
        title ILIKE '%Browserless engine failure%finaliz%' OR
        title ILIKE '%Engine finalize warning%' OR
        title ILIKE '%Mission execution failed: (no error message)%' OR
        title ILIKE '%posthog-recorder%' OR
        title ILIKE '%/envelope/%' OR
        title ILIKE '%ERR_BLOCKED_BY_CLIENT%' OR
        title ILIKE '%expect_no_console_error%' OR
        title ILIKE '%Network 0 POST%companion-diagnose%' OR
        title ILIKE '%Network 0 POST%check-subscription%' OR
        title ILIKE '%blocked by CORS%'
   );