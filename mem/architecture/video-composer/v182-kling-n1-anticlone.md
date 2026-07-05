---
name: v182 Kling N=1 Anti-Clone
description: Kling single-speaker path appends an exact-one-instance suffix to reduce duplicated/cloned characters; Kling never enters the Sync.so multi-speaker preflight
type: feature
---

# v182 — Kling N=1 Anti-Clone

## Problem

Kling N=1 renders could occasionally duplicate the selected character in one scene (mirror duplicate, split-screen variants, second person as poster/reflection).

## Fix

- When `clipSource === 'ai-kling'` and the dialog script resolves to exactly one speaker, append a positive exact-one-instance suffix to `scene.aiPrompt`: one continuous frame, no clone, no duplicate, no triptych, no split-screen, no mirror duplicate, no poster/photo/screen duplicate of the same face.
- Log: `v182_kling_n1_anticlone`.

## Kling stays OUT of the Sync.so multi-speaker preflight

Kling is **not** a lip-sync provider in this system. It never composes a cinematic-sync master prompt via `buildCinematicSyncMasterPrompt`, and it must not set `twoshot_stage='master_clip'` or `lip_sync_status='pending'`. Reason: Kling frequently produces two very close faces / reflections on the plate. Once such a plate enters `compose-dialog-segments`, the v153.2 preflight (`v153_plate_box_duplicate_for_speakers=…`) hard-blocks the run with "die einzelnen Sprecher konnten auf dem Video nicht eindeutig unterschieden werden" and refunds. Sync.so lip-sync is Hailuo-only. If you want lip-sync for a scene, switch `clipSource` to `ai-hailuo`.

## Related

- `mem/architecture/lipsync/v182-n1-tail-hold.md` — final full-frame freeze for the raw Hailuo plate after the last speech window (orthogonal, still active).
