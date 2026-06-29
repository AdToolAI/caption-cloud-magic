---
name: v167 N=1 Sync-Drive Restore
description: Cinematic-Sync N=1 plate prompts must instruct the character to speak naturally with subtle idle mouth/jaw motion. sync-3 needs an animatable mouth on the input plate to drive lipsync; a closed-mouth plate makes sync-3 return the input nearly unchanged (lips barely open). N≥2 keeps the closed-mouth lock from v171 to avoid ghost-speaker mouthing on parallel passes.
type: feature
---

# v167 — N=1 Sync-Drive Restore

## Symptom
After v166 the N=1 Cinematic-Sync close-up correctly locked the camera, but Samuel's lips barely opened — sync-3 was visibly not driving the mouth.

## Root Cause
v171 (Ghost-Speaker fix, parallel multi-speaker) and v173 (N=1 carve-out) both told the plate prompt to keep the mouth "softly closed, no idle mouth/jaw motion". For multi-speaker that prevents non-active speakers from ghost-mouthing on parallel pass overlays. For N=1 there is no ghost-speaker risk (one face, one pass), but a fully closed/static mouth gives sync-3 no animatable mouth to drive — per Sync.so's own AI-video tip:

> "the character should be speaking naturally"

Without that subtle idle motion, sync-3 returns the plate nearly unchanged.

## Fix
`supabase/functions/compose-video-clips/index.ts`:
1. `neutralTwoShotPrompt(n=1)` — mouth clause swapped from "still and softly closed, no idle motion" → "speaking naturally with subtle, continuous idle mouth and jaw motion (sync-3 needs an animatable mouth)". Camera-Lock suffix unchanged.
2. N=1 closing clause in `buildCinematicSyncMasterPrompt` — same flip; LOCKED-camera block unchanged.
3. New telemetry `v167_n1_sync_drive enabled=true` per N=1 build.

## Rule
- N=1 cinematic-sync plate prompts: idle mouth/jaw motion **on**.
- N≥2 cinematic-sync plate prompts: mouths **closed** (v171 ghost-speaker lock stays).
- Camera-Lock (v166) is independent of mouth state and applies to all N.

## Files
- `supabase/functions/compose-video-clips/index.ts` (Z. ~674 + Z. ~840)
