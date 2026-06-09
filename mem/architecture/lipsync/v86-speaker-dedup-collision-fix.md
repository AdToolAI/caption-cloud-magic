---
name: v86 Speaker Dedup Collision Fix
description: Hard-guard against two cast members collapsing into one Sync.so pass — root cause of "Char 1 spricht 2×, Char 4 hat Lippen zu"
type: feature
---

# v86 — Speaker Dedup Collision Guard

## Symptom
On 3–4 character dialog scenes, sometimes one character's lips never move while another character appears to speak twice. Reproduces intermittently — works when every dialog block has a clean `character_id`, fails when one block resolves only by name.

## Root cause
In `compose-twoshot-audio` the per-speaker grouping key was:

```ts
const key = String(seg.character_id || seg.speaker_slug || seg.speaker).toLowerCase();
```

When two cast members share a first-name slug (or one block lacks `character_id`), `charByName.get(firstName)` returns the SAME entry for both → both speakers' turns merge into one group → `speakerTracks.length = N-1` → `compose-dialog-segments` builds N-1 passes → the dropped speaker's audio physically rides on another speaker's track → that other character's face is lipsync'd twice while the dropped character stays static. `validateCast()` runs on the already-collapsed `twoshot.speakers` array so it never catches the drop.

## Fix (v86)
1. **`compose-twoshot-audio` — Ambiguity tracking**: While indexing `brand_characters` + `character_shots` into `charByName`, any key that maps to ≥2 distinct character ids is added to `ambiguousNameKeys`. When a dialog block's slug falls onto an ambiguous key without a unique full-slug match → return 400 `ambiguous_speaker_name`.
2. **`compose-twoshot-audio` — Post-grouping hard-guard**: After `speakerTracks` is built, count distinct rawSpeakers in `blocks`. If > `speakerTracks.length` → return 400 `speaker_dedup_collision` with the colliding pairs. Prevents wallet debit + downstream Sync.so dispatch.
3. **`compose-dialog-segments` — Defense-in-depth**: Before debit, compute distinct `character_id || speaker_slug` across `speakers`. If < `speakers.length` → set scene `failed` + `clip_error: speaker_count_mismatch` and return 400. No wallet spend.

## How to apply
Always group per-speaker audio by `character_id` when available. Treat a missing `character_id` on a block as a hard error in any multi-speaker scene — never fall back silently to first-name matching when ambiguity exists.

## Files
- `supabase/functions/compose-twoshot-audio/index.ts` (registerCharKey + ambiguousNameKeys + post-grouping guard)
- `supabase/functions/compose-dialog-segments/index.ts` (distinctCharIds guard before debit)
