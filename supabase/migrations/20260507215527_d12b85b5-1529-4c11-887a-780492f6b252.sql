create table if not exists public.scene_anchor_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  scene_id uuid not null,
  portrait_hash text not null,
  prompt_hash text not null,
  composed_url text not null,
  created_at timestamptz not null default now(),
  unique (scene_id, portrait_hash, prompt_hash)
);

alter table public.scene_anchor_cache enable row level security;

create policy "own anchor cache select" on public.scene_anchor_cache
  for select using (auth.uid() = user_id);
create policy "own anchor cache insert" on public.scene_anchor_cache
  for insert with check (auth.uid() = user_id);
create policy "own anchor cache delete" on public.scene_anchor_cache
  for delete using (auth.uid() = user_id);

create index if not exists scene_anchor_cache_lookup
  on public.scene_anchor_cache (scene_id, portrait_hash, prompt_hash);