---
name: Lip-Sync v55 stale-payload guard
description: Official multi-speaker Sync.so segments must be versioned v55/ref_only; stale v52 jobs with audioInput crop fields are failed locally and refunded.
type: constraint
---

# Lip-Sync v55 stale-payload guard

For `compose-dialog-segments` official multi-speaker Sync.so segments:

- New dispatch state MUST be `version: 55`, `engine: sync-official-segments-v55`, and `audio_input_mode: ref_only`.
- Segment payloads for per-speaker WAVs MUST keep `audioInput` as `{ refId }` only.
- Pre-dispatch validation MUST reject any `audioInput.startTime` or `audioInput.endTime` with `segment_audio_input_crop_forbidden` before calling Sync.so.
- `sync-so-webhook` MUST classify old terminal v52/v54 jobs whose stored segments still contain `audioInput.startTime/endTime` as `stale_payload_audio_crop`, free the inflight slot, and refund idempotently.
- `reset-lipsync-scene` must clear stale dialog state/job IDs so the next run cannot reuse legacy crop-based segments.

Never treat a new failure as a clean v55 provider failure unless `dialog_shots.engine === "sync-official-segments-v55"` and `dialog_shots.audio_input_mode === "ref_only"`.