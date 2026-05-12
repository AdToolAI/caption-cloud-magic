# Stage 24 — Pose Fix + Wardrobe Catalog Previews + 4-Perspective on Click

## Issue 1 — Pose Sheet returns 401
`generate-avatar-poses` uses the old `supabaseUser.auth.getUser()` pattern that broke after the auth-key rotation. Same bug we already fixed in `generate-avatar-wardrobe` and `generate-avatar-portrait`.

**Fix:** swap to `supabaseAdmin.auth.getUser(token)` (where `token = authHeader.replace(/^Bearer\s+/i, '')`), remove the `supabaseUser` client, redeploy.

## Issue 2 — Wardrobe should be a "shoppable catalog"
Today every wardrobe slot starts empty and the user has to hit "Generate Wardrobe Sheet" before they see anything. We change the UX so the customer sees all 92 styles as ready-made preview thumbnails (one male + one female random model per style, pre-seeded once globally), and only the **click on a style** triggers a personalized render — the new 4-perspective preview — for THEIR avatar.

### Two layers of imagery

| Layer | Who it shows | When generated | Where stored |
|---|---|---|---|
| **Catalog preview** | Random male OR female model wearing the outfit | Once globally, seeded by admin | `wardrobe_catalog_previews` (shared, public-read) |
| **Personalized 4-perspective** | The user's own avatar in that outfit, 4 angles | On first click of a style | `wardrobe_perspective_renders` (per user+variant) |

### New tables
1. `wardrobe_catalog_previews`
   - `theme_pack` (composite e.g. `historical:medieval`), `outfit_id` (e.g. `knight`), `gender` (`'male'|'female'`)
   - `image_url`, `storage_path`
   - Unique `(theme_pack, outfit_id, gender)`
   - Public-read RLS, admin-only write
2. `wardrobe_perspective_renders`
   - `user_id`, `avatar_id`, `theme_pack`, `outfit_id`, `perspective` (`'front'|'back'|'side'|'top'`)
   - `image_url`, `storage_path`
   - Unique `(avatar_id, theme_pack, outfit_id, perspective)` — idempotent / cached
   - Owner-only RLS

### New edge functions
1. **`seed-wardrobe-catalog`** (admin-only, manual trigger)
   - Iterates all 92 outfit slots × 2 genders = 184 renders
   - Uses Gemini Image with a generic seed-portrait per gender + the outfit description
   - Throttled in batches of 8 with `EdgeRuntime.waitUntil` so the function returns immediately and a `wardrobe_catalog_seed_jobs` row tracks progress
   - Skips existing rows → resumable / idempotent
2. **`generate-wardrobe-perspectives`**
   - Input: `{ avatar_id, theme_pack, outfit_id, outfit_label }`
   - Loads avatar (portrait_url) + outfit prompt
   - 4 parallel Gemini Image calls — Front / Back / Side / Top — each with strong identity-lock + outfit-lock
   - Uploads to `brand-characters/{user_id}/wardrobe-perspectives/{avatar_id}/{theme_pack}/{outfit_id}/{perspective}.png`
   - Upserts into `wardrobe_perspective_renders`
   - Robust auth pattern (same as Issue 1)

### UI changes

**`AvatarWardrobeSheet.tsx` / `VariantPickerGrid`**
- Each tile now resolves its image as: **personalized variant if exists** → else **catalog preview (gendered)** → else generic placeholder
- A small badge in the corner says `Catalog` vs `Yours` so it's clear which you're seeing
- Removes/hides the global "Generate Wardrobe Sheet" button — generation is now purely click-driven
- Gender toggle (♂/♀) above the grid, defaulting to the avatar's detected gender (read from `brand_characters.gender` if set, else male). Picks which catalog preview to show.

**`AvatarDetail.tsx` — left card becomes context-aware**
- Default → existing portrait
- After clicking a wardrobe tile → left card swaps to a 2×2 perspective grid for that outfit:
  - Tiles labeled Front / Back / Side / Top
  - If renders missing → shows the catalog preview (or skeletons) + auto-fires `generate-wardrobe-perspectives` once
  - On success → tiles swap to the personalized renders (cached in DB so re-clicking is instant)
  - "← Back to portrait" link clears the selection
- Slightly widen left column from `300px` to `380px` to fit the 2×2 grid comfortably

### Avatar gender field
- Add `gender` column to `brand_characters` (`'male'|'female'|'neutral'`, nullable)
- Existing avatars stay null → UI defaults to male catalog previews; user can flip the toggle anytime
- Optional: `AvatarPortraitDialog` upload step asks for gender (small radio group)

## Files

**New**
- Migration: `wardrobe_catalog_previews`, `wardrobe_perspective_renders`, `brand_characters.gender`
- `supabase/functions/seed-wardrobe-catalog/index.ts`
- `supabase/functions/generate-wardrobe-perspectives/index.ts`
- `src/components/brand-characters/WardrobePerspectiveCard.tsx`
- `src/hooks/useWardrobeCatalog.ts` (single query for all previews of the active theme:sub)
- `src/hooks/useWardrobePerspectives.ts`

**Edited**
- `supabase/functions/generate-avatar-poses/index.ts` — auth fix
- `src/components/brand-characters/AvatarWardrobeSheet.tsx` — catalog-first tiles, gender toggle, click handler
- `src/components/library-hubs/VariantPickerGrid.tsx` — accept `fallbackImageUrl` per slot + `badge`
- `src/pages/AvatarDetail.tsx` — selectedOutfit state, conditional left card

## Validation
1. Pose Sheet → "Generate" → 4 poses appear, no 401
2. Open wardrobe → all tiles already show a styled male/female model (catalog previews) without any generate-click
3. Toggle ♂/♀ → tiles re-render instantly (no API call, no spend)
4. Click a tile → left card switches to 2×2 perspective grid → 4 perspectives generate within ~30s → cached on re-click
5. "Back to portrait" returns to original view

## Note on seeding
Seeding 184 catalog images is a one-time admin operation. It runs in background batches via `EdgeRuntime.waitUntil` so the request returns immediately and you can monitor progress in `wardrobe_catalog_seed_jobs`. Cost ≈ €0.02 per Gemini image × 184 ≈ €3.70 one-time.
