UPDATE qa_missions
SET steps = '[
  {"type":"navigate","path":"/avatars","wait_ms":1500},
  {"type":"sleep","ms":800},
  {"type":"expect_visible","text":"Avatar","timeout_ms":8000},
  {"type":"expect_no_console_error"}
]'::jsonb
WHERE name = 'smoke-11-avatars-talking-head';

UPDATE qa_missions
SET steps = '[
  {"type":"navigate","path":"/ai-video-studio","wait_ms":2000},
  {"type":"expect_visible","text":"AI Video","timeout_ms":10000},
  {"type":"expect_no_console_error"},
  {"type":"click_text","text":"Hailuo","role":"any","timeout_ms":6000},
  {"type":"sleep","ms":800},
  {"type":"expect_visible","text":"Hailuo 2.3","timeout_ms":4000},
  {"type":"expect_no_console_error"}
]'::jsonb
WHERE name = 'smoke-03-ai-video-toolkit';

UPDATE qa_bug_reports
SET status = 'resolved'
WHERE status = 'open'
  AND (
    title ILIKE '%Browserless 400: Timeout must be an integer%'
    OR title ILIKE '%Browserless 408: Request has timed out%'
    OR title ILIKE '%expect_visible "Generate"%'
  );