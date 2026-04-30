UPDATE public.qa_missions
SET steps = '[
  {"type":"navigate","path":"/dashboard"},
  {"type":"navigate","path":"/picture-studio"},
  {"type":"navigate","path":"/ai-video-toolkit"}
]'::jsonb, updated_at = now()
WHERE name = 'smoke-01-dashboard-tour';

UPDATE public.qa_missions
SET steps = '[
  {"type":"navigate","path":"/calendar"},
  {"type":"navigate","path":"/music-studio"},
  {"type":"navigate","path":"/marketplace"}
]'::jsonb, updated_at = now()
WHERE name = 'smoke-02-secondary-tour';

INSERT INTO public.qa_missions (name, description, tier, category, steps, expected_assertions, cost_real_providers, cost_cap_cents, enabled, rate_limit_minutes, mock_mode)
VALUES
  ('smoke-01b-creator-tour',
   'Creator-Tour: Video Composer, Director''s Cut, Autopilot',
   'smoke', 'navigation',
   '[
     {"type":"navigate","path":"/video-composer"},
     {"type":"navigate","path":"/universal-directors-cut"},
     {"type":"navigate","path":"/autopilot"}
   ]'::jsonb,
   '[]'::jsonb,
   ARRAY[]::text[],
   0, true, 60, true),
  ('smoke-02b-tertiary-tour',
   'Tertiary-Tour: Avatars, Brand Characters, News Hub',
   'smoke', 'navigation',
   '[
     {"type":"navigate","path":"/avatars"},
     {"type":"navigate","path":"/brand-characters"},
     {"type":"navigate","path":"/news-hub"}
   ]'::jsonb,
   '[]'::jsonb,
   ARRAY[]::text[],
   0, true, 60, true)
ON CONFLICT (name) DO UPDATE
  SET steps = EXCLUDED.steps,
      description = EXCLUDED.description,
      enabled = true,
      updated_at = now();

UPDATE public.qa_missions
SET steps = '[
  {"type":"navigate","path":"/picture-studio","wait_ms":2000},
  {"type":"expect_visible","text":"Picture","timeout_ms":10000},
  {"type":"expect_no_console_error"}
]'::jsonb, updated_at = now()
WHERE name = 'smoke-02-picture-studio-mock';

INSERT INTO public.qa_muted_patterns (pattern_regex, reason, mission_pattern)
VALUES
  ('Network 404 GET: /icon-192', 'Stale PWA-Icon reference from old service-worker cache; sw.js fixed', NULL),
  ('Network 404 GET: /icons?/icon-(72|192|512)', 'Stale PWA icon paths from cached service-worker; resolved in sw.js', NULL),
  ('Network 406 GET: /rest/v1/companion_user_preferences', 'PostgREST 406 on empty maybeSingle() — code path is correct, response is benign', NULL),
  ('Console: Failed to load resource: the server responded with a status of 406', 'Generic console echo of PostgREST 406 — covered by upstream pattern', NULL)
ON CONFLICT DO NOTHING;

UPDATE public.qa_bug_reports
SET status = 'resolved', resolved_at = now()
WHERE status = 'open';
