UPDATE public.qa_missions SET steps = '[
  {"type":"navigate","path":"/ai-video-studio","wait_ms":2000},
  {"type":"expect_visible","text":"AI Video","timeout_ms":10000},
  {"type":"expect_no_console_error"},
  {"type":"click_text","text":"Hailuo","role":"any","timeout_ms":6000},
  {"type":"sleep","ms":600},
  {"type":"expect_visible","text":"Generate","timeout_ms":4000},
  {"type":"expect_no_console_error"}
]'::jsonb WHERE name = 'smoke-03-ai-video-toolkit';

UPDATE public.qa_missions SET steps = '[
  {"type":"navigate","path":"/picture-studio","wait_ms":2000},
  {"type":"expect_visible","text":"Picture Studio","timeout_ms":10000},
  {"type":"expect_no_console_error"},
  {"type":"expect_visible","text":"Generate","timeout_ms":6000},
  {"type":"expect_no_console_error"}
]'::jsonb WHERE name = 'smoke-02-picture-studio-mock';