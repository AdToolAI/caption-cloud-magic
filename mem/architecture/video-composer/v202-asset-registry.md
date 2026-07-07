---
name: v202 Cast & World ID Registry (scene_assets)
description: composer_scenes.scene_assets jsonb array of AssetRef is the canonical ID-based bridge between Cast&World, Composer, Motion Studio and downstream renderers
type: architecture
---

# v202 — Cast & World ID-Registry

## Motivation
After v201 fixed dialog lip-sync to be ID-only (`dialog_turns[].characterId`),
the rest of the pipeline (locations, buildings, props, style presets, and
the briefing analyser) still used a mix of name matching, slug lookups and
scattered legacy columns (`mentioned_location_ids`, `applied_style_preset_id`,
`character_shots`). That prevented a single canonical view of "what's in this
scene" and made cross-tool (Composer ↔ Motion Studio ↔ Briefing) references
brittle.

## Data model
`composer_scenes.scene_assets jsonb NOT NULL DEFAULT '[]'` — array of
`AssetRef`:

```
{ type: 'character' | 'location' | 'building' | 'prop' | 'style',
  id: string,           // UUID (brand_characters.id, brand_locations.id, …)
  variantId?: string,   // outfit look / location variant, optional
  role?: string,        // e.g. 'protagonist', 'backdrop', 'hero product'
  displayName?: string  // log/debug only, NEVER used for matching
}
```

GIN index `composer_scenes_scene_assets_gin` (jsonb_path_ops).

## Feature flag
`system_config.composer.feature.scene_assets_required` (default `false`).
When true, `compose-video-clips` hard-fails with
`v202_asset_registry_mismatch` if any dialog `characterId` cannot be found
as an `AssetRef(type=character)` on the scene.

## Runtime behaviour
- **JIT backfill**: `ensureSceneAssetsForScene(sceneId)` in
  `supabase/functions/_shared/asset-ref.ts` — if `scene_assets` is empty,
  build it from `character_shots[].characterId`,
  `mentioned_location_ids[0]`, and `applied_style_preset_id`, then persist
  best-effort (`WHERE scene_assets IS NULL OR = '[]'`).
- **Resolver**: `resolveSceneAssets(refs)` — hydrates each ref with
  `referenceImageUrl`, `canonicalName`, `voiceId`, joining
  `brand_characters` / `brand_locations` / `brand_buildings` / `brand_props`.
- **Log marker**: `v202_asset_registry_bound` emitted by
  `compose-video-clips` on every request with per-scene breakdown, and by
  `compose-dialog-segments` right after canonical dialog_turns resolve
  (assets_total / characters / locations / missing[]).
- **Briefing → apply write-path (Teil B)**: `briefing-deep-parse` computes
  `plan.scenes[i].sceneAssets` from resolved cast/location IDs and returns
  it inside the ProductionPlan. `useApplyProductionPlan` includes
  `scene_assets` in the `composer_scenes` INSERT payload, so freshly
  plan-applied scenes never need JIT-backfill.

## Boundaries (intentional)
- No frontend UI change. Editor keeps writing `character_shots` and legacy
  columns; backend derives `scene_assets` on the fly. Only the
  plan-applier now writes `scene_assets` directly.
- Motion Studio snippets keep their own reference columns for now. They will
  gain a `scene_assets` layer once Composer path is verified.
- Face-Track preclip (v201 Teil B) is still gated by
  `composer.feature.face_track_preclip=false`.
- `render-directors-cut` does not consume `scene_assets` yet — it operates
  on rendered clip URLs and doesn't need character/location resolution.

## Files
- `supabase/migrations/…_v202_scene_assets.sql` — column, index, backfill,
  feature flag row.
- `supabase/functions/_shared/asset-ref.ts` — types + resolver + JIT ensure.
- `supabase/functions/compose-video-clips/index.ts` — imports + stage
  `v202_scene_assets_ensure` + `v202_asset_registry_bound` log +
  optional hard-fail gate.
- `supabase/functions/compose-dialog-segments/index.ts` — reads
  `scene_assets` column + emits `v202_asset_registry_bound` log with
  speaker↔registry cross-check.
- `supabase/functions/briefing-deep-parse/index.ts` — post-Pass-C emitter
  that writes `plan.scenes[i].sceneAssets` from resolved cast/location IDs.
- `src/lib/video-composer/briefing/productionPlan.ts` — `PlanScene.sceneAssets`
  zod field.
- `src/hooks/useApplyProductionPlan.ts` — builds `sceneAssets` per scene
  (uses plan-provided array when present, else derives from cast+location)
  and includes it in the `composer_scenes` INSERT.

