---
name: Lip-Sync v54 Sync-3 Official Segments
description: Multi-speaker (3+) official Sync.so segments dispatch in compose-dialog-segments must use the `sync-3` model, not `lipsync-2-pro`.
type: constraint
---

# Lip-Sync v54 Sync-3 Official Segments

For the official Sync.so multi-speaker `segments[]` dispatch (3+ speakers,
single Sync.so generation) in `compose-dialog-segments`:

1. **Model MUST be `sync-3`.** `lipsync-2-pro` requires natural speaking
   motion in the source video (Sync.so docs/models/lipsync — "Still Frame
   Limitation") and returns opaque `An unknown error occurred.` on static
   3-person Hailuo plates. `sync-3` is Sync.so's recommended model for
   multi-person, static, occluded, or partial-face shots and can open
   silent lips.
2. **Payload stays doc-strict.** Per Sync.so docs/developer-guides/segments
   and speaker-selection: top-level `model`, `input[]` (1 video + N
   audio with `refId`), `segments[]` (each with `startTime`, `endTime`,
   `audioInput.refId`, and `optionsOverride.active_speaker_detection`
   `{ auto_detect: false, frame_number, coordinates: [cx, cy] }`),
   `options.sync_mode: "cut_off"`, and `webhookUrl`. No `segments_secs`.
3. **No `temperature` / `occlusion_detection_enabled` for sync-3.** Both
   are managed natively by sync-3 and are ignored if sent.
4. `active_speaker_detection` per segment is supported on all LipSync
   models (lipsync-2, lipsync-2-pro, sync-3) — keep the per-segment
   point/frame selection in place.
