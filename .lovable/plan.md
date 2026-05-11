## Stage 6 — Wardrobe & Prop Variants

Direct extension of Stage 3 (Pose Sheets + Vibe Strips). Same locked-identity / locked-geometry strategy, same Gemini Image (`google/gemini-3.1-flash-image-preview`) pipeline, same storage buckets — just two new axes.

### Scope

**A) Avatar Wardrobe Sheets** — 4 outfit variants per `brand_character`, identity-locked.
- Presets: `casual`, `formal`, `action`, `brand` (CI-aware: pulls brand colors if available, else neutral).
- Stored in new `avatar_wardrobe_variants` (mirrors `avatar_pose_variants`).
- Mounted on `/avatars/:id` (AvatarDetail) directly under the existing PoseSheet.

**B) Location Prop Variants** — 4 prop/dressing variants per `brand_location`, geometry-locked.
- Presets: `empty`, `product-hero`, `lifestyle`, `event` (camera + room geometry preserved, only set-dressing changes).
- Stored in new `location_prop_variants` (mirrors `location_vibe_variants`).
- Mounted inline on Locations cards next to the existing VibeStrip (collapsible "Props" row).

### Out of scope
- No new studios, no Composer wiring beyond what `useUnifiedMentionLibrary` already does (variants surface automatically once rows exist, since mentions resolve by parent ID + variant tag — no schema change in mention library).
- No regeneration UI per single tile — only "Generate Sheet" / "Regenerate Sheet" (same UX as Pose Sheet).
- No video, no i2v calls in this stage. Pure image variants.

### Database (1 migration)

```sql
create table public.avatar_wardrobe_variants (
  id uuid primary key default gen_random_uuid(),
  avatar_id uuid not null references public.brand_characters(id) on delete cascade,
  outfit_id text not null,        -- 'casual' | 'formal' | 'action' | 'brand'
  label text not null,
  image_url text not null,
  storage_path text,
  created_at timestamptz default now(),
  unique (avatar_id, outfit_id)
);
alter table public.avatar_wardrobe_variants enable row level security;
-- RLS: select/insert/update/delete via avatar ownership (same shape as avatar_pose_variants)

create table public.location_prop_variants (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.brand_locations(id) on delete cascade,
  prop_id text not null,          -- 'empty' | 'product-hero' | 'lifestyle' | 'event'
  label text not null,
  image_url text not null,
  storage_path text,
  created_at timestamptz default now(),
  unique (location_id, prop_id)
);
alter table public.location_prop_variants enable row level security;
-- RLS analog to location_vibe_variants
```

### Edge functions (2 new)

- `generate-avatar-wardrobe` — clone of `generate-avatar-poses`, wardrobe presets + stronger identity-lock (face + hair untouched, only clothing/accessories swap), saves to `brand-characters` bucket under `${user_id}/wardrobe/${avatar_id}/`.
- `generate-location-props` — clone of `generate-location-vibes`, geometry-lock prompt ("preserve camera angle, walls, floor, windows; only re-dress the set"), saves to `brand-locations` bucket under `${user_id}/props/${location_id}/`.

Both: parallel Promise.allSettled, idempotent upsert on unique key, English prompts.

### UI

- **`AvatarWardrobeSheet.tsx`** (new) — clone of `AvatarPoseSheet` skin, mounted in `AvatarDetail.tsx` under the PoseSheet card.
- **`LocationPropStrip.tsx`** (new) — clone of `LocationVibeStrip` skin, mounted on Locations cards in a collapsible row labeled "Props".

Both reuse Card/Button/grid layout, Bond palette, no new design tokens.

### Memory

Update `mem://features/library-hubs/pose-sheets-and-vibe-variants.md` to also list `avatar_wardrobe_variants` (4 outfits) and `location_prop_variants` (4 dressings); keep one consolidated memory for the entire Library-Hub variant system.

### Files (new)
- `supabase/functions/generate-avatar-wardrobe/index.ts`
- `supabase/functions/generate-location-props/index.ts`
- `src/components/brand-characters/AvatarWardrobeSheet.tsx`
- `src/components/locations/LocationPropStrip.tsx`
- 1 migration file

### Files (edited)
- `src/pages/AvatarDetail.tsx` — mount WardrobeSheet
- `src/pages/Locations.tsx` — mount PropStrip
- `mem://features/library-hubs/pose-sheets-and-vibe-variants.md`
- `mem://index.md` — update bullet text

Estimated size: **small** — pure clone of an established pattern, no architectural risk.
