---
name: v182 Kling N=1 Anti-Clone
description: Kling single-speaker Cinematic-Sync uses the closed-mouth master prompt plus an exact-one-instance suffix to reduce duplicated/cloned characters
type: feature
---

# v182 — Kling N=1 Anti-Clone

## Problem

Kling N=1 renders could occasionally duplicate the selected character in one scene. The Kling provider path used the raw scene prompt even for Cinematic-Sync, so it missed the single-subject closed-mouth master-plate constraints and had no dedicated negative-prompt field for anti-clone rules.

## Fix

- For `ai-kling` + `engineOverride === 'cinematic-sync'`, dispatch `buildCinematicSyncMasterPrompt(scene)` instead of the raw `scene.aiPrompt`.
- When the dialog script resolves to exactly one speaker, append a positive exact-one-instance suffix: one continuous frame, no clone, no duplicate, no triptych, no split-screen, no mirror duplicate, no poster/photo/screen duplicate of the same face.
- Preserve the existing cinematic-sync anchor compose/audit path before Kling receives `start_image`.

## Logs

- `v182_kling_n1_anticlone`
- `v182_n1_closed_mouth_prompt`
