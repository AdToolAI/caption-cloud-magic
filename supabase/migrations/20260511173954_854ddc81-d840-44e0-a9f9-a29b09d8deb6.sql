
create table if not exists public.avatar_pose_variants (
  id uuid primary key default gen_random_uuid(),
  avatar_id uuid not null references public.brand_characters(id) on delete cascade,
  pose_id text not null,
  label text not null,
  image_url text not null,
  storage_path text,
  created_at timestamptz not null default now(),
  unique (avatar_id, pose_id)
);
create index if not exists idx_avatar_pose_variants_avatar on public.avatar_pose_variants(avatar_id);
alter table public.avatar_pose_variants enable row level security;

create policy "owner select poses"
  on public.avatar_pose_variants for select
  using (exists (select 1 from public.brand_characters c where c.id = avatar_id and c.user_id = auth.uid()));
create policy "owner insert poses"
  on public.avatar_pose_variants for insert
  with check (exists (select 1 from public.brand_characters c where c.id = avatar_id and c.user_id = auth.uid()));
create policy "owner delete poses"
  on public.avatar_pose_variants for delete
  using (exists (select 1 from public.brand_characters c where c.id = avatar_id and c.user_id = auth.uid()));

create table if not exists public.location_vibe_variants (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.brand_locations(id) on delete cascade,
  vibe_id text not null,
  label text not null,
  image_url text not null,
  storage_path text,
  created_at timestamptz not null default now(),
  unique (location_id, vibe_id)
);
create index if not exists idx_location_vibe_variants_location on public.location_vibe_variants(location_id);
alter table public.location_vibe_variants enable row level security;

create policy "owner select vibes"
  on public.location_vibe_variants for select
  using (exists (select 1 from public.brand_locations l where l.id = location_id and l.user_id = auth.uid()));
create policy "owner insert vibes"
  on public.location_vibe_variants for insert
  with check (exists (select 1 from public.brand_locations l where l.id = location_id and l.user_id = auth.uid()));
create policy "owner delete vibes"
  on public.location_vibe_variants for delete
  using (exists (select 1 from public.brand_locations l where l.id = location_id and l.user_id = auth.uid()));
