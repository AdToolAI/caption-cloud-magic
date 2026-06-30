# v178 Wave 2 — Briefing → Storyboard Mapping Persistence

**Scope.** Briefing→Storyboard only. The lipsync, render, anchor, audit and
provider pipelines are untouched.

## Problem snapshot

After v178 Wave 1 (Catalog-ID shadow fields) we still saw three classes of
breakage in the Production Plan Sheet:

1. **Scene 2/3 had no Sprecher/Outfit/Location dropdowns.** The
   `scene-count` guard in `briefing-deep-parse` padded missing scenes with
   empty `{engine:'broll'}` skeletons → no cast → no row → no select.
2. **Location stayed empty even when „@Home Office" was visible on the
   left.** The local fill-pass only matched on bare `mentionKey` and ignored
   multi-segment Catalog IDs (`catalog:location:<uuid>`) plus exact slugs.
3. **Outfits flickered between „Casual" and „Unbenannter Look".** The Sheet
   built outfit labels solely from `useUnifiedMentionLibrary`, which lags the
   `avatar_outfit_looks` table during quick-create flows.

## Fix

| Where | What |
|---|---|
| `supabase/functions/briefing-deep-parse/index.ts` (scene-count guard) | Inherit a template scene's `cast` / `location` / `shotDirector` when padding so every scene exposes the same dropdowns. |
| `supabase/functions/briefing-deep-parse/index.ts` (location local fill) | (a) Extract UUIDs from `catalog:location:<uuid>` and verify against the user library; (b) exact-slug match before substring; (c) emit `location_resolution` metrics in `parser_meta` (viaSlug / viaSubstring / viaCatalogUuid / stillUnresolved). |
| `src/components/video-composer/briefing/ProductionPlanSheet.tsx` | DB fallback for outfit look names — query `avatar_outfit_looks` by ids referenced in the plan and merge into `outfitLabelById`. The dropdown now shows the real name even when the unified mention library hasn't refreshed. |
| `src/components/video-composer/briefing/ProductionPlanSheet.tsx` | `quickCreateLocation` fans the new `locationId` out to every scene whose `mentionKey` / `locationName` normalises to the same key (no per-scene click). |

## Invariants kept

- No call into compose-video-clips, compose-scene-anchor,
  compose-dialog-segments, render-sync-segments-audio-mux, or sync.so.
- No change to `useApplyProductionPlan` apart from what's already shipped.
- Padded scenes keep `engine: template.engine ?? 'broll'`; if the template
  was a Cinematic-Sync scene the padded ones inherit it — the UI then lets
  the user demote to b-roll explicitly.

## Telemetry to watch

`parser_meta.location_resolution = { viaSlug, viaSubstring, viaCatalogUuid, stillUnresolved }`.
A spike in `stillUnresolved` means the user library is missing the
mentioned location — the Sheet's "+ Als Location speichern" button now
covers that with a single click that propagates to every matching scene.
