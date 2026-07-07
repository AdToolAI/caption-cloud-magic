---
name: v200 ID-Only Cast Resolution
description: Backend enforces brand_characters.id as single source of truth for dialog speakers via composer_scenes.dialog_turns; no more name-based fuzzy matching in compose-video-clips / compose-twoshot-audio
type: feature
---

# v200 — ID-Only Cast Resolution

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
- **DONE**: `compose-video-clips` — both cast-resolution sites
  (cinematic-sync ~L1696 and universal anchor ~L2306) prefer turns and skip
  legacy STAGE 5 fuzzy synthesis when turns are present. Log marker
  `v200_id_only_cast`.
- **DONE**: `compose-twoshot-audio` — new `blocksFromDialogTurns()` builds
  segments directly from turn.characterId, bypassing `parseDialogScript()`;
  `resolveVoice()` tries `dialog_voices[characterId]` first; segments loop
  skips ambiguity check when block.characterId is set. Log marker
  `v200_id_only_cast`.
- **NOT DONE (Teil B — Face-Lock)**: `track-scene-faces` edge function,
  `pass-face-preclip` trajectory-aware crop, DialogStitchVideo track-aware
  mask center. Feature flag `composer.feature.face_track_preclip=false`
  gates the future rollout — table exists, no producer/consumer yet.

## Frontend impact
None. Editor already writes `characterShots[]` with UUIDs; `dialog_turns`
is populated server-side via migration backfill for existing scenes. New
scenes without turns fall through to the legacy name resolver (behavior
identical to pre-v200).

## Validation
- 3-speaker test scene: `syncso_dispatch_log` should show correct
  character_id per pass; `speakers_source=dialog_turns` in metadata.
- Rollback: `UPDATE system_config SET value='false'::jsonb WHERE
  key='composer.feature.id_only_cast_resolution'` restores legacy fuzzy
  matching without redeploy.

## Files touched
- `supabase/functions/_shared/scene-dialog-turns.ts` (new)
- `supabase/functions/compose-video-clips/index.ts` (import + fetch +
  2 resolver call sites + STAGE 5 gate)
- `supabase/functions/compose-twoshot-audio/index.ts` (import + block
  builder + resolveVoice ID-first + segments loop ID-first)
