-- 1) Mission Step 2: language-neutral selector statt englischem Text "Calendar"
UPDATE qa_missions
SET steps = '[
  {"type":"navigate","path":"/calendar","wait_ms":2500},
  {"type":"wait_selector","selector":"[data-testid=\"calendar-page\"]","timeout_ms":10000},
  {"type":"sleep","ms":1500},
  {"type":"expect_no_console_error"}
]'::jsonb,
    updated_at = now()
WHERE name = 'smoke-07-calendar-crud';

-- 2) Offene Bug-Reports zu dieser Mission auflösen
UPDATE qa_bug_reports
SET status = 'resolved',
    resolved_at = now()
WHERE status IN ('open', 'triaged', 'in_progress')
  AND (
    mission_name = 'smoke-07-calendar-crud'
    OR title ILIKE '%calendar_integrations%'
    OR description ILIKE '%calendar_integrations%'
  );