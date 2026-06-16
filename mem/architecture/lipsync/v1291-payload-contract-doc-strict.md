---
name: v129.1 Sync.so Payload-Contract Doc-Strict
description: Multi-Speaker preclip passes MUST transform plate-space coords into preclip-space and send doc-strict ASD; auto_detect:true is blocked at preflight
type: feature
---

# v129.1 — Doc-Strict Payload Contract (Multi-Speaker Preclip)

**Edge function:** `supabase/functions/compose-dialog-segments/index.ts` (only).

## Rule
For every `usePassPreclip && speakers.length >= 2` dispatch to Sync.so:
- Transform persisted plate-space `pass.coords` into preclip-space using `pass.preclip_crop`:
  - `scale = outputSize / crop.size`
  - `x' = round((plateX - crop.x) * scale)`, `y' = round((plateY - crop.y) * scale)`
- Send `active_speaker_detection = { auto_detect:false, frame_number, coordinates:[x',y'] }`.
- **Never** `auto_detect:true` on multi-speaker preclips with persisted coords (violates v106 doc-strict; produces visually no-op Sync.so output).

## Preflight (`DISPATCH_BLOCKED_PAYLOAD_PRECHECK`)
Hard block (no retry, idempotent refund) when any of these hold:
- Transformed coords out of `[0, outputSize)` (no silent clamping).
- Multi-Speaker preclip missing coords or preclip_crop.
- Multi-Speaker preclip payload would still send `auto_detect:true` despite persisted coords.

Logged as `sync_status='PRE_DISPATCH_FAILED'`, `error_class='internal_payload_contract_violation'`.

## Persistence (`syncso_dispatch_log.meta`)
Every dispatch row carries:
- `v1291_payload_contract: true`
- `outbound_payload.{ model, options }` (verbatim sanitized options; URLs omitted, already on `video_url` / `payload_video_url`)
- `coord_transform` (full plate→preclip math + in_bounds flag)
- `v116_diag.asd_mode === "preclip_coords_doc_strict"` on the success path

## Preserved paths
- Single-Speaker preclip → `auto_detect:true` (v115).
- Explicit `bbox-url-pro` / `coords-pro-box` retry variants → unchanged; v129.1 does NOT promote `bounding_boxes_url` to default.
- Full-plate v108 multi-speaker `auto_detect` guard → unchanged.

## NOT touched
State machine, watchdog, retry, locking, Plan-D, model swap, segments API, UI.
