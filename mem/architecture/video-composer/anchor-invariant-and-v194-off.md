---
name: Cinematic-Sync Anchor Invariant + v194 disabled
description: Hard-guard v195 in compose-video-clips fails cinematic-sync scenes that reach provider dispatch without a composed reference_image_url; v194 silent-speaker-pass is switched off in system_config
type: feature
---

## Hard invariant (v195)

Any scene with `engine_override in ('cinematic-sync','sync-segments')` MUST have a non-null `reference_image_url` at the point where `compose-video-clips` selects the provider. If it is null, the scene fails fast with `cinematic_sync_anchor_missing` BEFORE any Hailuo/HappyHorse/Sync.so spend.

Rationale: without a composed character anchor the provider invents strangers → face-map/plate-face-identity finds no brand-character faces → Sync.so passes run into an endless retry loop with wrong identities.

Fix location: `supabase/functions/compose-video-clips/index.ts` right after the multi-cast anchor safety net block (search for `v195_cinematic_sync_anchor_missing`).

## v194 disabled

`system_config.composer.silent_speaker_pass_v194 = false`. The listener-mouth stabilizer pass is off; we're back to v169 where only active speakers get Sync.so passes. The gate code is still present (behind the flag) but MUST NOT be re-enabled without solving the SILENT_AUDIO_GATE collision.

## Cast-ID prefixes

`compose-video-clips` and `_shared/twoshot-face-map.ts` still normalize legacy prefixed IDs (`outfit:`, `catalog:`, `lib:`, `preset:`). New client code MUST write only the base `brand_characters.id` into `character_shots[].characterId` and put the optional look reference in `character_shots[].outfitLookId`. `CastRef` + `mentionToCastRef` are the single boundary — never construct cast entries from `mention.id` directly.
