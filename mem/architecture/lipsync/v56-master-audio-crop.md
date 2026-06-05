---
name: Lip-Sync v56 Master-Audio Crop
description: Multi-speaker Sync-3 dispatch must send a single master-dialog audio input and per-segment audioInput.startTime/endTime crops; ASD is manual-point first, with an automatic retry that drops ASD entirely.
type: constraint
---

# Lip-Sync v56 Master-Audio Crop

For `compose-dialog-segments` multi-speaker dispatches against Sync-3:

1. `input[]` MUST contain exactly one audio entry: the master dialog WAV from `audio_plan.twoshot.url` with `refId: "dialog_master"`. Do NOT ship per-speaker WAVs as separate `input` entries — Sync-3 returned opaque "An unknown error occurred." on multi-input payloads.
2. Each `segments[]` entry MUST use `audioInput: { refId: "dialog_master", startTime, endTime }` matching the segment's own scene-timeline window. The crop is now valid because the referenced audio spans the full timeline.
3. Per-segment ASD on the first attempt uses ONLY `{ frame_number, coordinates }`. Do NOT send `auto_detect: false` alongside the manual point — the four ASD variants are mutually exclusive per Sync.so /developer-guides/speaker-selection and `auto_detect` already defaults to false.
4. If the first attempt fails with `error_code: null` / generic provider error, `sync-so-webhook` MUST retry exactly once with `retry_no_asd: true`, which drops `optionsOverride.active_speaker_detection` so Sync-3 picks the speaker automatically. This survives off-face anchor coords on Hailuo plates.
5. State markers: `version: 56`, `engine: "sync-official-segments-v56"`, `audio_input_mode: "master_audio_crop"`, `asd_mode: "manual_point_minimal" | "auto_asd_fallback"`.

Supersedes v55 (`audio_input_mode: ref_only`, per-speaker WAVs).
