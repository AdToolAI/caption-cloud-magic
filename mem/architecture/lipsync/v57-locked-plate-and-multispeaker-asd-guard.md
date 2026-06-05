---
name: Lip-Sync v57 Locked-Plate & Multi-Speaker ASD Guard
description: Cinematic-Sync master plates hard-block camera cuts/zoom/shot-changes in prompt+negative; sync-so-webhook auto-ASD retry is disabled for ≥2-speaker scenes to prevent wrong-face audio mapping during stray close-ups.
type: constraint
---

# Lip-Sync v57 — Locked Plate & Multi-Speaker ASD Guard

Two coupled hardenings on top of v56 (`master_audio_crop`).

## 1. Locked-camera master plate (compose-video-clips)

Hailuo/Kling/Wan i2v invent a mid-clip camera cut or push-in when given a 3-shot start-frame plus a long dialog-style prompt. Sync.so then either maps the wrong speaker's audio onto the wrong face (auto-ASD) or returns the opaque "unknown error" (manual ASD).

- `neutralTwoShotPrompt` ends with a hard sentence: *"LOCKED static camera mounted on a tripod for the entire shot — no cuts, no zoom, no push-in, no pull-out, no dolly, no pan, no tilt, no reframing, no shot change. The framing, focal length and every person's position in the frame stay identical from the first frame to the last frame."*
- `CINEMATIC_SYNC_SILENT_MASTER_NEGATIVE` is extended with the full set of in-clip framing changes (camera cut, scene change, shot change, zoom in/out, push/pull, dolly, crane, pan, tilt, whip pan, close-up insert, reframe, second camera, multi-camera, picture-in-picture).
- This rule applies to every Cinematic-Sync master plate, regardless of provider.

## 2. No auto-ASD fallback for multi-speaker scenes (sync-so-webhook)

`sync-so-webhook` previously fell back to `retry_no_asd: true` (drop `optionsOverride.active_speaker_detection`) on the first opaque Sync-3 failure. For single-speaker scenes that's fine — only one face exists. For **≥2 distinct speaker refs** it is dangerous: if the plate contains a stray close-up, auto-ASD locks onto whichever mouth is visible and paste-syncs the wrong speaker's audio onto that face.

- Detection: `state.speaker_refs.length >= 2`.
- Behaviour: `wantV56NoAsdRetry = isV56Manual && !isMultiSpeaker && …`.
- Single-speaker scenes keep the v56 one-shot auto-ASD retry.
- Multi-speaker scenes now fail loudly after the manual-ASD attempt rather than producing a wrong-face mapping.

## State markers

- `version: 56`, `engine: "sync-official-segments-v56"`, `audio_input_mode: "master_audio_crop"` unchanged.
- `asd_mode` remains `manual_point_minimal` for multi-speaker (no `auto_asd_fallback` allowed).

Supersedes v56's webhook auto-retry path for multi-speaker only.
