---
name: Sync-3 Fallback + Identity Soft-Pass (v37)
description: 3+ speaker retry ladder is now coords-pro → coords-pro-box → sync3-coords (Sync.so sync-3 model) → auto-* (only as last-ditch). Face-gate also accepts identity-matched anchor coords for 3+ speakers without per-frame plate face validation, because Sync.so's ActiveSpeaker DTO operates on frame_number+coordinates in plate-pixel space and does not require Gemini re-detection at that exact frame.
type: architecture
---

**Problem (v36):** Face-gate hard-blocked 3+ speaker scenes (`plate_target_face_missing_pass_0_speaker_*`) even when the anchor faceMap had identity-matched all speakers. Gemini's per-frame face detection only consistently locked onto the most prominent face, so the strict "plate frame must contain >= N faces" check rejected valid scenes before Sync.so was ever called.

**Plus:** The retry ladder ended at `coords-pro-box` for 3+ speakers (auto-* blocked due to face-swap risk), so any provider_unknown_error exhausted with refund — even though Sync.so's docs explicitly recommend `sync-3` for difficult/static/occluded/multi-speaker plates.

**v37 fixes:**

1. **Face-gate soft-pass for identity-matched 3+ speakers** (`compose-dialog-segments` ~line 956): when `coordSources` is all `"identity"` for ≥3 speakers, skip the strict per-frame plate face-check. Anchor identity match is more reliable than per-frame Gemini face detection because Gemini sees the same scene composition the i2v model rendered from.

2. **Sync-3 added as a real retry variant**:
   - `RETRY_VARIANTS` (dispatcher) + `V5_RETRY_VARIANTS` (webhook) now include `sync3-coords` between `coords-pro-box` and `auto-pro`.
   - `compose-dialog-segments` dispatch builder handles `sync3-coords` like `coords-pro` (same frame_number+coordinates DTO) but with `model: "sync-3"`.
   - `sync-so-webhook` 3+ speaker ladder escalates `coords-pro-box → sync3-coords` BEFORE the auto-* face-swap-risk fallback.

**References:**
- https://sync.so/docs/developer-guides/speaker-selection (ActiveSpeaker DTO)
- https://sync.so/docs/models/lipsync (sync-3 use cases: 4K native, obstruction detection, can open closed lips)

**Out of scope (deferred):**
- True canonical single-request `segments[]` with per-segment `optionsOverride.active_speaker_detection` for 3+ speakers (would require replacing the multi-pass + mask-compositor architecture; high regression risk for 1-/2-speaker scenes that work today).
