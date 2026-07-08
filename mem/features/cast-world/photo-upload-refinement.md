---
name: Cast & World Photo-Upload Refinement
description: One-shot AI restaging pipeline that turns any user photo into a clean Cast & World reference asset (transparent cutout for characters/props/buildings, cinematic shot for locations). Wires photo → brand-uploads bucket → refine-asset-photo edge fn → client cutout → brand_* row.
type: feature
---

# Cast & World — Photo-Upload Refinement

## Purpose
Give users a single, uniform flow to turn any messy photo (a person, a laptop,
a building, a location) into a canonical Cast & World asset with a real
`brand_*.id` UUID and a clean reference image. Same UI, same result quality,
whether the input is a studio shot or a bad phone snapshot.

## Pipeline

```
[AssetPhotoUploadSheet]
  ↓ file
[Storage: brand-uploads/<userId>/<uuid>.<ext>]  (private, RLS: user-id first segment)
  ↓ signed URL (10 min)
[Edge Fn: refine-asset-photo]
  1. fetch source → data URL
  2. Nano Banana 2 (google/gemini-3.1-flash-image) via AI Gateway
     - chat-shape body: messages[{content: [{type:'text'}, {type:'image_url'}]}]
     - fallback: google/gemini-2.5-flash-image
     - kind-specific restage prompts (all English, per Core rule)
     - character/prop/building: solid pure-white background
     - location: cinematic establishing shot (no cutout)
  3. Upload refined image to target bucket (brand-characters for characters,
     brand-locations for the rest — same buckets the manual create paths use)
  4. INSERT into brand_characters | brand_props | brand_buildings | brand_locations
     with user_id = auth.uid(). UUID is Postgres-issued.
  ↓ response: { asset, bucket, storage_path, refined_url, needs_client_cutout }
[Client: useRefineAssetPhoto]
  5. If needs_client_cutout: run @huggingface/transformers segmentation
     (src/lib/backgroundRemoval.ts high quality). Upload cutout PNG to
     the same target bucket, then call RPC update_asset_reference_image
     to swap the reference_image_url on the newly created row.
  6. Delete raw upload from brand-uploads.
  7. Invalidate ['brand-<kind>s'] + unified-mention-library queries →
     new asset shows up immediately in UnifiedAssetPicker.
```

## IDs & ownership (answer to the recurring user question)
- Every asset created through this path gets a fresh Postgres-issued `uuid`
  in the matching brand table — same canonical ID the v202/v211 pipeline
  expects. No slug matching, no legacy fallback needed.
- Assets are **private per user/workspace**. RLS on `brand_*` tables scopes
  everything by `user_id = auth.uid()`. Other users never see them.
- Storage: `brand-characters` and `brand-locations` buckets are already
  RLS-scoped by `(storage.foldername(name))[1] = auth.uid()::text`. The new
  `brand-uploads` bucket enforces the same rule (see migration).
- Only the seeded `*_catalog_previews` remain visible to every user
  (catalog IDs, not brand IDs).

## Guard rails
- `refine-asset-photo` requires JWT (edge fn checks `auth.getUser()`).
- `update_asset_reference_image` RPC is `SECURITY DEFINER` and filters by
  `user_id = auth.uid()` — a caller cannot mutate another user's assets.
- Background removal failure is **non-fatal**: the asset stays on the
  solid-white refined image and is still fully usable through the pipeline.

## Files
- Edge fn: `supabase/functions/refine-asset-photo/index.ts`
- Hook:    `src/hooks/useRefineAssetPhoto.ts`
- UI:      `src/components/cast-world/AssetPhotoUploadSheet.tsx`
- Wire-in:
  - `src/pages/Library.tsx` (People tab header + AssetTabBody for locations,
    buildings, props)
  - `src/components/video-composer/UnifiedAssetPicker.tsx` (inline "Create
    from photo (AI)…" option per world-asset row + empty-state chip)
- Migration: `brand-uploads` bucket + RLS + `update_asset_reference_image`
  RPC.

## Out of scope
- Outfits (`avatar_outfit_looks`) — different multi-view pipeline.
- Voices — audio, not image.
- Public/shared uploaded assets — kept strictly private.
- Batch multi-photo upload in one sheet.
