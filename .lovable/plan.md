## Problem

The Wardrobe Sheet only shows real model previews for **Lifestyle → Everyday/Formal** (16 of ~368 expected rows). Every other theme/sub-pack/gender combo falls through to empty "Not generated" tiles, so the user is forced to click *Generate* / *Use my face*. The two background seed jobs both stalled at **12 / 192 slots** — the edge function's `EdgeRuntime.waitUntil` work is dying long before finishing 32 batches of Gemini image calls.

## Goal

1. Have a **complete catalog** (male + female × all 6 themes × all sub-packs × 4 outfits ≈ **368 images**) so every tile shows a ready-made preview, just like Lifestyle → Everyday today.
2. Remove the **"Use my face / Re-render with my face"** button and the status hint line — the sheet should just display the catalog grid, nothing else.

## Plan

### 1. Make `seed-wardrobe-catalog` resumable (small fix in edge function)

Root cause of the stalls: one long `waitUntil` task tries to run 32 batches × 6 Gemini calls. Background runtime gets killed mid-flight, the job row stays `running` forever and the next invocation skips the same already-completed rows but still tries to run the same giant work loop and dies again.

Change the edge function so each invocation:
- Computes `todo` (missing slots) as today.
- Processes **at most `MAX_PER_INVOCATION = 24`** slots (4 batches of 6) **synchronously**, then returns `{ done: false, remaining: N }` if more left, or `{ done: true }` when finished.
- Marks the seed job row `done` only when `remaining === 0`.

No DB schema change. No change to prompt / style lock / storage layout.

### 2. Run it to completion

After deploying the chunked function, call it repeatedly via `supabase--curl_edge_functions` until `done: true` (≈ 16 calls × ~30 s each, ~8 min total). Verify with a `count(*) group by theme_pack, gender` that every (theme:sub, gender) has 4 rows.

### 3. Strip the personalization CTA from `AvatarWardrobeSheet.tsx`

- Remove the **"Use my face (~30s)"** / **"Re-render with my face"** button entirely.
- Remove the status sentence above the grid ("Generic model previews — outfits are locked…", "Catalog preview wird vorbereitet…", "Showing your avatar in …").
- Drop the `handleGenerate` function, the `isGenerating` state, the `Sparkles` / `Loader2` imports, and the `onGenerate` prop passed to `VariantPickerGrid` (the grid will simply show skeletons while loading and tiles once data arrives).
- Keep: theme pills, sub-pack pills, gender toggle/lock, the variant grid, and the `onSelect` handoff to Motion Studio / AI Video Studio (unchanged).

The personalize-with-my-avatar path stays available elsewhere via the existing `generate-avatar-wardrobe` function (it's still called by other surfaces / can be re-surfaced later), we just don't expose it here anymore.

### 4. Verify

- Open Avatars → Matthew Dusatko (male) → Wardrobe → cycle Lifestyle / Business / Historical (all 7 sub-packs) / Fantasy / Sci-Fi / Sport. Every tile shows a male model in the right outfit.
- Pick any female avatar → toggle locks to ♀ → same coverage check.
- Click any tile → confirm `onSelect` still fires and the perspective card opens with a usable image URL.
- Confirm there is no "Use my face" / "Re-render" button anywhere in the sheet.

## Files

- `supabase/functions/seed-wardrobe-catalog/index.ts` — chunked, resumable invocation.
- `src/components/brand-characters/AvatarWardrobeSheet.tsx` — remove personalize CTA + status line + related state/imports/props.
- No DB migration, no other component changes.

## Notes for the user (non-technical)

- The catalog generation runs in the background after deploy and takes ~8 minutes total to finish all ~350+ outfit images. While it runs, missing tiles show as skeletons and fill in automatically as each batch completes — no clicking required.
