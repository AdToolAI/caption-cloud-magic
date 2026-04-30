-- 1) Mock-mode flag for missions (default ON for safety)
ALTER TABLE public.qa_missions
  ADD COLUMN IF NOT EXISTS mock_mode BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.qa_missions.mock_mode IS
  'When true, executor sends x-qa-mock=true header so AI edge functions return fake responses instead of calling Replicate/Runway/ElevenLabs/etc.';

-- 2) Upgrade smoke-03-ai-video-toolkit to interactive steps
UPDATE public.qa_missions
SET steps = '[
  {"type":"navigate","path":"/ai-video-studio","wait_ms":1500},
  {"type":"expect_visible","text":"AI Video","timeout_ms":8000},
  {"type":"expect_no_console_error"},
  {"type":"click_text","text":"Hailuo","role":"any","timeout_ms":6000},
  {"type":"sleep","ms":600},
  {"type":"expect_no_console_error"},
  {"type":"click_text","text":"Generate","role":"button","timeout_ms":4000},
  {"type":"sleep","ms":1500},
  {"type":"expect_no_console_error"}
]'::jsonb
WHERE name = 'smoke-03-ai-video-toolkit';

-- 3) Upgrade smoke-02-picture-studio-mock to interactive steps
UPDATE public.qa_missions
SET steps = '[
  {"type":"navigate","path":"/picture-studio","wait_ms":1500},
  {"type":"expect_visible","text":"Picture Studio","timeout_ms":8000},
  {"type":"expect_no_console_error"},
  {"type":"fill","selector":"textarea, input[type=\"text\"]","value":"e2e-mock test prompt","timeout_ms":6000},
  {"type":"sleep","ms":400},
  {"type":"click_text","text":"Generate","role":"button","timeout_ms":4000},
  {"type":"sleep","ms":1500},
  {"type":"expect_no_console_error"}
]'::jsonb
WHERE name = 'smoke-02-picture-studio-mock';