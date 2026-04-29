-- Slim down smoke-01-dashboard-tour from 12 routes to 6 core routes
-- and split the remaining 6 secondary routes into a new smoke-02 mission.
-- This gives the round-robin picker two smaller tours instead of one giant one,
-- so a single slow route can't kill the entire smoke suite.

UPDATE qa_missions
SET steps = '[
  {"type":"navigate","path":"/dashboard"},
  {"type":"navigate","path":"/picture-studio"},
  {"type":"navigate","path":"/ai-video-toolkit"},
  {"type":"navigate","path":"/video-composer"},
  {"type":"navigate","path":"/universal-directors-cut"},
  {"type":"navigate","path":"/autopilot"}
]'::jsonb
WHERE name = 'smoke-01-dashboard-tour';

INSERT INTO qa_missions (name, tier, enabled, steps, rate_limit_minutes, cost_cap_cents, cost_real_providers)
SELECT
  'smoke-02-secondary-tour',
  'smoke',
  true,
  '[
    {"type":"navigate","path":"/calendar"},
    {"type":"navigate","path":"/music-studio"},
    {"type":"navigate","path":"/marketplace"},
    {"type":"navigate","path":"/avatars"},
    {"type":"navigate","path":"/brand-characters"},
    {"type":"navigate","path":"/news-hub"}
  ]'::jsonb,
  15,
  0,
  '{}'::text[]
WHERE NOT EXISTS (SELECT 1 FROM qa_missions WHERE name = 'smoke-02-secondary-tour');
