---
name: v103 sync-3 preclip dispatch — no bounding_boxes, loop when audio>video
description: DB-verified root cause for `provider_unknown_error` on multi-speaker preclip dispatches — sync-3 silently rejects `bounding_boxes` (lipsync-2-pro-only feature). v103 drops bbox on preclip path and forces `sync_mode=loop` when per-pass audio exceeds the 1.87s preclip.
type: architecture
---

# v103 — sync-3 preclip dispatch hardening (June 2026)

## Root cause (DB-verified)

Scene `f67d51ba…` (4 speakers), 18:06 UTC dispatches: all 4 passes returned
`provider_unknown_error` (HTTP 200 + webhook FAILED). Payload inspection in
`syncso_dispatch_log.meta.webhook_payload`:

- `model: sync-3`
- `options.active_speaker_detection.bounding_boxes`: 56 entries of `[97,72,417,438]`
- preclip = 1.87s @ 30fps = 56 frames → **bbox perfectly aligned**
- audio = ~9s tight VO, `sync_mode: cut_off`

Alignment was correct. The failure mode is **`sync-3` does not accept the
`bounding_boxes` option** — per Sync.so docs that field is a `lipsync-2-pro`
exclusive. v101 reintroduced bbox on the preclip path to fix the v100
silent no-op, but that broke sync-3 unconditionally.

## Fix (`compose-dialog-segments/index.ts`, `usePassPreclip` branch)

1. `active_speaker_detection = { auto_detect: true }` always (single-face
   512×512 crop → unambiguous).
2. Override `sync_mode = 'loop'` when
   `audio_full_sec > preclip_duration_sec + 0.05`. Prevents `cut_off`
   truncating output to 1.87s when the per-pass tight VO is 8–9s.
3. v102 probe is kept (now `stage: "preclip-autodetect-v103"`) so future
   regressions are diagnosable.

## Deprecates

- v99 (`v99-preclip-explicit-bbox`) and v101
  (`v101-preclip-bbox-restored`): both attached `bounding_boxes` to the
  preclip dispatch. v103 supersedes them. Do NOT reintroduce bbox to the
  sync-3 path. If a silent no-op resurfaces on `auto_detect:true`, the
  correct response is to escalate to `lipsync-2-pro` (existing retry
  ladder slot `coords-pro-lp2pro`), NOT to add bbox back to sync-3.

## Verification

- New dispatch should show `meta.v102_probe.stage = "preclip-autodetect-v103"`,
  `bbox_count = 0`, `sync_mode = "loop"` for multi-turn passes.
- `syncso_dispatch_log.sync_status` should reach `DISPATCHED` and webhook
  should return `COMPLETED` (not `FAILED`).
