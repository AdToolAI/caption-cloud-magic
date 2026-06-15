---
name: v126 Unified Preclip Pipeline
description: One pipeline for all speaker counts. Single-face preclip + sync-3 + auto_detect + cut_off. No full-plate fallback. Webhook retries clear preclip + provider state.
type: feature
---

# v126 — Unified Sync.so Pipeline (June 2026)

## Rule
Every Sync.so dispatch in `compose-dialog-segments` (for N = 1..4 speakers) uses the same payload shape:

```
model: "sync-3"
options.sync_mode: "cut_off"
options.active_speaker_detection: { auto_detect: true }
input[0]: single-face preclip (720p+ via Remotion Lambda)
input[1]: tight per-turn WAV
```

No `temperature`, no `occlusion_detection_enabled`, no `bounding_boxes*`, no `coordinates`, no `frame_number`.

If the preclip cannot be produced after the v116 face-gate expansion ladder (1.0/1.4/1.8), the pass fails clean with a refund. No silent full-plate dispatch.

## Why
DB-verified failure (scene `cba18767-be99-454a-95b8-939d6ad6f107`, June 15 2026): Samuel was edge-positioned, so the old `freshDefaultVariant` picked `bbox-url-pro` → full multi-face plate → `provider_unknown_error` in 20s → `retrying` with dead `job_id` → watchdog killed the scene at 10 min. The other 3 speakers, which used preclip + auto_detect, all succeeded.

## What changed
- `compose-dialog-segments`:
  - `freshDefaultVariant` is always `"coords-pro"`. Legacy variants (`bbox-url-pro`, `coords-pro-box`, `auto-pro`, `auto-standard`) on a retry are normalized back to `coords-pro`.
  - v118 preclip-bypass blocks removed (no longer drop a valid preclip for face_count mismatch or variant escalation).
  - v107 hard-fail expanded to v126: any pass with coords + tight audio MUST have a preclip; otherwise refund.
  - Batch preclip no longer skips edge speakers.
- `sync-so-webhook` (v5 fan-out retry path):
  - Forces `retry_variant: "coords-pro"`.
  - Clears `job_id`, `output_url`, `started_at`, `finished_at`, `preclip_url`, `preclip_render_id`, `preclip_crop`, `preclip_face_count`, `preclip_error` on the failing pass.
- `lipsync-watchdog`:
  - `retrying` passes with no live `job_id` are dispatched (advance) instead of silently waiting for the next webhook.
  - `STALE_HARD_MS` raised 20 → 25 min so recovery gets one extra cron cycle.

## Validation
- `syncso_dispatch_log` for any new pass must show:
  - `meta.dispatch_video_kind = 'preclip'`
  - `meta.payload_summary.options.active_speaker_detection.auto_detect = true`
  - no `bounding_boxes_url`, no `bounding_boxes`, no `coordinates`
- Scene-level: a failed sibling pass no longer takes down a scene where other passes succeeded — only the failing pass is retried.

## Forbidden
- First-dispatch `bbox-url-pro` on full plate.
- Dropping a valid preclip because `preclip_face_count !== 1`.
- Watchdog failing a scene whose `retrying` passes still have remaining budget.
