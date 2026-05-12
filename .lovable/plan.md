## Stage 28 — Pre-rendered Wardrobe Catalog (no manual generate step)

### Diagnose
- The infrastructure already exists (`wardrobe_catalog_previews` table + `seed-wardrobe-catalog` edge function with a generic male/female fashion model + identity-neutral STYLE_LOCK).
- The table is just under-seeded: **only 5 of ~192 expected rows** exist (lifestyle:everyday/formal/seasonal partials). That's why every other sub-pack and the entire female side falls through to the "Generate 4 outfits" empty state.

### Goal
For every Theme → Sub-Pack the user opens (Business → Creative, Historical → Medieval, Fantasy → Light, Sport → Combat, …), instantly show **4 outfits on a generic model** for both ♀ and ♂. No "Generate" CTA required. The user's own avatar render becomes an *optional upgrade*.

### Plan

**1. Backfill the catalog (one-time, server-side)**
- Trigger `seed-wardrobe-catalog` (already admin-gated, idempotent, runs as background job via `EdgeRuntime.waitUntil`) over the full slot list.
- Coverage target = 6 themes × ~23 sub-packs × 4 outfits × 2 genders = **~192 images**.
- Throttled at BATCH_SIZE=6 → ~5–10 min total wall-clock; progress visible in `wardrobe_catalog_seed_jobs`.
- Generic model + neutral face is already enforced in `STYLE_LOCK` (the brief: "outfits are important, not the face") — exactly what you asked for.

**2. Replace the "Generate 4 outfits" empty state in `AvatarWardrobeSheet.tsx`**
- Remove the full-card empty state.
- While catalog rows are still loading: show 4 shimmer/skeleton tiles (not a CTA) — they'll fill in within seconds.
- If catalog still has 0 rows for that combo after load (rare race during rollout): tiny inline hint "Preview wird vorbereitet…" instead of forcing the user to click.
- Keep the existing "Personalize with my avatar" path, but demote it to a small ghost button **above** the grid: *"Use my face for these 4 outfits (~30s)"*. So generation stays available, just no longer mandatory.

**3. Send-to-Studio still works on catalog tiles**
- Catalog variants already flow through `variantsBySlot` with `variantId: ''` and a real `imageUrl`.
- The existing `onSelect` handoff in `AvatarDetail` → `WardrobePerspectiveCard` works the same way — the catalog image is used as the outfit reference; the avatar's face is locked separately via the saved character identity.

### Files affected
- `supabase/functions/seed-wardrobe-catalog/index.ts` — no code change, just **invoke** with `{}` (full sweep) once.
- `src/components/brand-characters/AvatarWardrobeSheet.tsx` — drop the empty-state card, demote `handleGenerate` to a small inline "Personalize" link above the grid.

### Validation
1. Open Avatars → any avatar → Wardrobe → Business → Creative → see 4 outfits on the generic ♂ model.
2. Toggle ♀ (or open a female-locked avatar) → see 4 outfits on the generic ♀ model.
3. Same for Historical → Medieval, Fantasy → Light, Sport → Combat, Sci-Fi → Cyber.
4. "Personalize with my avatar" still triggers `generate-avatar-wardrobe` for users who want their own face on the outfits.
5. Send-to-Studio mention copy still resolves to a usable reference image.

### Out of scope
- No DB schema migration (table + RLS already correct).
- No new UI components — only the empty-state branch in one file changes.
- Wardrobe perspectives, saved looks, lightbox, gender lock — all unchanged.
