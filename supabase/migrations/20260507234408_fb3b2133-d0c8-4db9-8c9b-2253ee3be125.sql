alter table public.composer_scenes
  add column if not exists character_shots jsonb not null default '[]'::jsonb;