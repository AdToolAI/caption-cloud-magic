---
name: v41 Official Sync.so Multi-Speaker Segments
description: For 3+ speaker dialog scenes, compose-dialog-segments now dispatches ONE Sync.so generation with the documented top-level `segments[]` payload (audioInput.refId + per-segment optionsOverride.active_speaker_detection) using sync-3 — replacing the fragile v5 fan-out + tight-WAV + segments_secs + bounding-box retry ladder that kept returning "An unknown error occurred."
type: architecture
---

**Why:** Sync.so's official Segments Guide (https://sync.so/docs/developer-guides/segments) is unambiguous about the canonical multi-speaker shape:

```text
input:
  { type: "video", url }
  { type: "audio", url, ref_id: "speaker_1" }
  { type: "audio", url, ref_id: "speaker_2" }
  { type: "audio", url, ref_id: "speaker_3" }
segments:
  - { startTime, endTime, audioInput: { refId, startTime, endTime },
      optionsOverride.active_speaker_detection: { frame_number, coordinates } }
options: { sync_mode: "loop" }
model: sync-3
```

The previous v5–v40 stack tried to emulate this with N independent Sync.so jobs, per-pass tight-WAV slicing, `segments_secs` on the video input, and a fan-in Remotion compositor with circular face-masks. Every layer of that emulation was its own failure mode: tight-WAV `offset out of bounds` on retry, `bounding_boxes` rejected with opaque `An unknown error occurred.`, partial-mux speakers staying silent, and a 13-min wallclock burning Sync.so concurrency slots before refunding.

**Trigger:** `speakers.length >= 3` on fresh dispatch (or `retry_v41: true`). 1- and 2-speaker scenes keep the proven v5 fan-out — they were never the bug.

**State (`composer_scenes.dialog_shots`):**

```text
{ version: 41,
  engine: "sync-official-segments",
  status: "rendering" | "done" | "failed",
  model: "sync-3",
  sync_job_id, source_clip_url, total_sec,
  segments[], speaker_refs[], video_width, video_height,
  cost_credits, refunded, retry_count, started_at }
```

**Webhook handling (`sync-so-webhook`):**

- Matches `state.version === 41 && state.sync_job_id === jobId`.
- `COMPLETED` → re-host outputUrl to `ai-videos/composer/{user}/{scene}-v41-lipsync.mp4`, set `clip_url`, `lip_sync_status='applied'`, `lip_sync_applied_at`, `dialog_shots.status='done'`. No fan-in compositor — Sync.so returns one complete video with every speaker animated.
- `FAILED/REJECTED/CANCELED` → 1 transient retry via `compose-dialog-segments` with `retry_v41: true` (same canonical payload), then idempotent wallet refund + `lip_sync_status='failed'`. No more `coords-pro` → `coords-pro-box` → `sync3-coords` → `auto-*` ladder, no tight-WAV repair, no partial mux.

**Log markers:**
- Dispatch: `v41_official_segments_payload model=sync-3 speakers=N segments=N`
- Apply: `v41 scene=… DONE final=…`
- Retry: `v41 scene=… retry 1/1`
- Fail: `v41 scene=… → FAILED refunded=…`

**Scene reset (one-time):** `5f43e669-b154-4ac9-a516-b46acb7ee288` was reset (dialog_shots=null, lip_sync_status=pending) so the auto-trigger picks it up on the new v41 path without colliding with the v40 state.
