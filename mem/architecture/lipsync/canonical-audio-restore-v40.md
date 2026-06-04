---
name: Canonical Audio Restore (v40)
description: Multi-speaker dialog passes restore audio_url_full before re-slicing on retry — fixes v39 "tight WAV + segments_secs" mismatch that caused Sync.so "unknown error"
type: feature
---

`compose-dialog-segments` v40 always restores `pass.audio_url` from `pass.audio_url_full` and clears `audio_tight` before the v39 tight-WAV slicer runs.

**Why:** v39 mutated `audio_url` to the sliced turn-only WAV on first dispatch. On retry the cloned pass still pointed at that short WAV, the slicer threw `sliceWav: no valid windows` for absolute windows outside the tight range, the code fell back to full-length path, but `pass.audio_url` was still the mutated 3.27s tight WAV while the video input now carried `segments_secs:[[3.81,7.082]]`. Sync.so returned `An unknown error occurred` because audio length and animation window were incompatible — only Speaker 1 lip-synced.

**Fix log marker:** `v40_restore_canonical_audio`.

Single-speaker and 1- to 2-speaker paths are unaffected (no slicing happens there). Lambda bundle does NOT need to be redeployed for this fix.
