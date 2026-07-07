---
name: v201 Canonical ID + Bounding-Boxes Lipsync
description: Backend enforces composer_scenes.dialog_turns[].characterId plus sync-3 bounding_boxes_url; legacy name matching and v153 env rollback are blocked
type: feature
---

# v201 — Canonical ID + Bounding-Boxes Lipsync

## Motivation
Speaker mismatch ("Sprecher 3 sagt was, was nicht im Skript stand") was caused
by three name-based fuzzy resolvers that parsed `NAME:` prefixes out of the
free-text `dialog_script` and matched them against `brand_characters.name` or
`characterShots[].characterId` slugs. Two characters sharing a first name, or
a generic label like `SPRECHER 1:`, collapsed onto the wrong Sync.so pass.

## Fix
`composer_scenes.dialog_turns` (jsonb) is the canonical, ID-referenced turn list:
```
[{ turnId, characterId, text, mood?, order }]
```
When populated, the backend uses `turn.characterId` (brand_characters.id UUID)
as authoritative. NO name parsing, NO fuzzy match.

## Rollout state
- **DONE**: DB migration adds `composer_scenes.dialog_turns` + one-shot
  best-effort backfill from existing `dialog_script` + `character_shots`.
- **DONE**: `scene_face_tracks` table + RLS (foundation for Teil B).
- **DONE**: Feature flag `composer.feature.id_only_cast_resolution` in
  `system_config` (default true). Toggle to `false` for emergency rollback
  without redeploy.
- **DONE (v201)**: `_shared/scene-dialog-turns.ts` has
  `ensureDialogTurnsForScene()` for just-in-time backfill from
  `dialog_script + character_shots + brand_characters`. It returns no partial
  mappings; unmatched/ambiguous speakers hard-block provider dispatch.
- **DONE (v201)**: `compose-video-clips`, `compose-twoshot-audio`, and
  `compose-dialog-segments` call the JIT backfill before falling back to any
  legacy parser. Log markers: `v201_dialog_turns_jit_backfill`,
  `v201_id_only_required_block`, `v201_id_only_cast`.
- **DONE (v201)**: `compose-dialog-segments` ignores the historical
  `FEATURE_V153_BBOX_PRIMARY` rollback path. The v153 full-plate primary path
  cannot be reactivated by env. Dispatch is pinned to `sync-3` with
  `active_speaker_detection.bounding_boxes_url` / inline `bounding_boxes`.
- **DONE (v201)**: Coordinate-only or `auto_detect:true` wire ASD is blocked
  before Sync.so dispatch for dialog passes. Dispatch metadata includes
  `canonical_lipsync_pipeline='v201_id_bbox_sync3'`, `speakers_source`,
  `dialog_turns_count`, `canonical_speaker_ids`, and `asd_mode`.
- **REVERTED (v203 → v204)**: The v203 full-plate-only zwang was rolled back
  because Sync.so systematically rejected multi-face plates with
  `generation_input_face_selection_invalid`. The canonical path is now v204:
  per-pass single-face preclip + `bounding_boxes_url` in clip-space + `sync-3`
  + `cut_off`. See `mem://architecture/lipsync/v204-preclip-bbox-clipspace-rollback`.
  Dispatch metadata uses `canonical_lipsync_pipeline='v204_preclip_bbox_clipspace'`,
  `input_space='clip'`, and `preclip_used=true` for N≥2.
- **NOT DONE (Teil B — Face-Lock)**: `track-scene-faces` edge function,
  `pass-face-preclip` trajectory-aware crop, DialogStitchVideo track-aware
  mask center. Feature flag `composer.feature.face_track_preclip=false`
  gates the future rollout — table exists, no producer/consumer yet.

## Frontend impact
None. Editor already writes `characterShots[]` with UUIDs. Backend now fills
`dialog_turns` just-in-time for legacy scenes and blocks ambiguous ID mapping
instead of silently using names.

## Validation
- 3-speaker test scene: `syncso_dispatch_log` should show correct
  `character_id` per pass, `speakers_source=dialog_turns`,
  `canonical_lipsync_pipeline=v204_preclip_bbox_clipspace`,
  `input_space=clip`, `preclip_used=true`, `asd_mode=bounding_boxes_url`,
  and `model=sync-3`.
- The old v153 env rollback is intentionally blocked; do not re-enable
  `FEATURE_V153_BBOX_PRIMARY`.

## Files touched
- `supabase/functions/_shared/scene-dialog-turns.ts` (new)
- `supabase/functions/compose-video-clips/index.ts` (import + fetch +
  2 resolver call sites + STAGE 5 gate)
- `supabase/functions/compose-twoshot-audio/index.ts` (import + block
  builder + resolveVoice ID-first + segments loop ID-first)
