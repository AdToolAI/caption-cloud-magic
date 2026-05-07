alter table public.composer_scenes
  add column if not exists dialog_script text,
  add column if not exists dialog_voices jsonb not null default '{}'::jsonb;