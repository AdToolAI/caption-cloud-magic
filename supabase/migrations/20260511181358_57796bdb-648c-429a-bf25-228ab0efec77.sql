-- Stage 6: Wardrobe & Prop Variants

create table if not exists public.avatar_wardrobe_variants (
  id uuid primary key default gen_random_uuid(),
  avatar_id uuid not null references public.brand_characters(id) on delete cascade,
  outfit_id text not null,
  label text not null,
  image_url text not null,
  storage_path text,
  created_at timestamptz not null default now(),
  unique (avatar_id, outfit_id)
);
alter table public.avatar_wardrobe_variants enable row level security;

create policy "Users can view own avatar wardrobe variants"
on public.avatar_wardrobe_variants for select to authenticated
using (exists (select 1 from public.brand_characters bc where bc.id = avatar_id and bc.user_id = auth.uid()));

create policy "Users can insert own avatar wardrobe variants"
on public.avatar_wardrobe_variants for insert to authenticated
with check (exists (select 1 from public.brand_characters bc where bc.id = avatar_id and bc.user_id = auth.uid()));

create policy "Users can update own avatar wardrobe variants"
on public.avatar_wardrobe_variants for update to authenticated
using (exists (select 1 from public.brand_characters bc where bc.id = avatar_id and bc.user_id = auth.uid()));

create policy "Users can delete own avatar wardrobe variants"
on public.avatar_wardrobe_variants for delete to authenticated
using (exists (select 1 from public.brand_characters bc where bc.id = avatar_id and bc.user_id = auth.uid()));

create index if not exists idx_avatar_wardrobe_avatar on public.avatar_wardrobe_variants(avatar_id);


create table if not exists public.location_prop_variants (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.brand_locations(id) on delete cascade,
  prop_id text not null,
  label text not null,
  image_url text not null,
  storage_path text,
  created_at timestamptz not null default now(),
  unique (location_id, prop_id)
);
alter table public.location_prop_variants enable row level security;

create policy "Users can view own location prop variants"
on public.location_prop_variants for select to authenticated
using (exists (select 1 from public.brand_locations bl where bl.id = location_id and bl.user_id = auth.uid()));

create policy "Users can insert own location prop variants"
on public.location_prop_variants for insert to authenticated
with check (exists (select 1 from public.brand_locations bl where bl.id = location_id and bl.user_id = auth.uid()));

create policy "Users can update own location prop variants"
on public.location_prop_variants for update to authenticated
using (exists (select 1 from public.brand_locations bl where bl.id = location_id and bl.user_id = auth.uid()));

create policy "Users can delete own location prop variants"
on public.location_prop_variants for delete to authenticated
using (exists (select 1 from public.brand_locations bl where bl.id = location_id and bl.user_id = auth.uid()));

create index if not exists idx_location_props_location on public.location_prop_variants(location_id);
