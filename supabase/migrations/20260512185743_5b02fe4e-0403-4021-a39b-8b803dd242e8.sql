create table if not exists public.scene_director_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  cache_key text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, cache_key)
);

alter table public.scene_director_cache enable row level security;

create policy "own scene director cache select" on public.scene_director_cache
  for select using (auth.uid() = user_id);
create policy "own scene director cache insert" on public.scene_director_cache
  for insert with check (auth.uid() = user_id);
create policy "own scene director cache delete" on public.scene_director_cache
  for delete using (auth.uid() = user_id);

create index if not exists scene_director_cache_lookup
  on public.scene_director_cache (user_id, cache_key);