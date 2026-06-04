---
name: Multi-Speaker Honesty Policy (v36)
description: For 3+ speaker Sync.so scenes, partial-mux is forbidden. If any pflicht-speaker pass fails after retries, sync-so-webhook refunds + marks scene failed (status='failed', lip_sync_status='failed', clip_error names the failed speakers) instead of producing a video where only some characters lip-sync. Face-gate repair in compose-dialog-segments must NOT collapse a missing slot onto slot 0 — for 3+ speakers we require sortedBoxes.length >= speakers.length AND pass.speaker_idx < sortedBoxes.length, otherwise the pass fails cleanly with full refund.
type: feature
---

**Symptom (v35 and earlier):** 3-speaker scenes rendered with only the middle character lip-syncing. The other two characters' Sync.so passes failed with provider_unknown_error, but the webhook still triggered render-sync-segments-audio-mux with `partialMux=true`, declaring the scene `done` with the only successful pass as `final_url`.

**Root causes:**
1. `sync-so-webhook` partial-mux gate accepted any `doneCount > 0`, including 1/3 → user saw a video where 2 of 3 characters are silent.
2. `compose-dialog-segments` face-gate repair collapsed missing speaker slots onto `Math.min(speaker_idx, sortedBoxes.length - 1)` → when only 1 face was detected on a 3-speaker plate, all 3 speakers received the same coords, Sync.so animated only the first.

**Fix:**
- `sync-so-webhook` line ~880: `partialMux` now only allowed for `totalSpeakers <= 2`. For 3+ speakers, any failure that exhausts the retry ladder triggers `mustFailScene=true`: refund (idempotent), mark `lip_sync_status='failed'`, set `dialog_shots.error` + `partial_failed_speakers[]`.
- `compose-dialog-segments` face-gate (around line 990): require `sortedBoxes.length >= speakers.length` AND `pass.speaker_idx < sortedBoxes.length` before accepting a repair for 3+ speakers. Otherwise the pass enters the unaccepted branch → full refund + `plate_target_face_missing_*` error.

**Out of scope (deferred):**
- `sync-3` model fallback for difficult plates — not yet wired into RETRY_VARIANTS.
- 1- and 2-speaker partial-mux behaviour unchanged.
