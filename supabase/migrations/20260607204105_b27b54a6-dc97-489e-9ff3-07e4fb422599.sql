create table if not exists public.translation_cache (
  hash text primary key,
  source_lang text not null,
  target_lang text not null,
  source text not null,
  target text not null,
  created_at timestamptz not null default now()
);

grant all on public.translation_cache to service_role;

alter table public.translation_cache enable row level security;