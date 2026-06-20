---
name: Lipsync Plate Rehost (v143)
description: Every Sync.so dispatch rehosts the plate into the lipsync-plates bucket with a 7-day signed URL, eliminating presigned-Replicate-URL expiry as the cause of 422 "generation_input_video_inaccessible" failures that previously masqueraded as ASD/NOOP bugs.
type: feature
---

# v143 — Plate Rehost (Sync.so input-URL stability)

## Root cause (proved by v142 diagnostic)

All 5 v142 diagnostic variants (sync-3 auto_detect, flat coords, bbox_url,
bbox inline, lipsync-2-pro) failed with the same upstream error:

```
HTTP 422
errorCode: generation_input_video_inaccessible
"The provided video URL is inaccessible — make sure it is publicly fetchable
 (not expired or auth-gated), or upload via POST /v2/assets/upload."
```

The plate was a presigned `s3.eu-central-1.amazonaws.com/...` URL from Hailuo
via Replicate. Those URLs expire after ~60 minutes. Multi-pass dialog scenes
with 4 speakers regularly exceed that window before Sync.so dispatches the
final pass.

Weeks of ASD/coords/bounding-box hypotheses (v76, v122, v130, v134, v140,
v141, v142-diag) were chasing this single URL-lifetime problem.

## Architecture

### Helper: `_shared/rehostPlate.ts`

- `rehostPlate(supabase, sourceUrl, { sceneId, passIdx, kind, ownerId })`
- Downloads `sourceUrl` (45s timeout, min 1 KB body), uploads to bucket
  `lipsync-plates` at path `${ownerId}/${sceneId}/p{N}-${kind}-${hash}.mp4`,
  returns a **7-day signed URL** (longer than any conceivable dispatch +
  retry + watchdog cycle).
- Deterministic path from SHA-1 of `sourceUrl.split("?")[0]` so retries on
  the same expired URL collapse to one rehosted object (idempotent).
- Short-circuits when the input is already a `lipsync-plates` signed URL.

### Bucket: `lipsync-plates`

- **Private** (public buckets blocked in this workspace).
- 50 MB cap, mime allowlist `video/mp4|quicktime|webm`.
- RLS: public `SELECT`, service-role only `INSERT/UPDATE/DELETE`.
- Sync.so fetches via the 7-day signed URL (path includes `?token=...`).

### Call sites that now rehost before dispatch

1. `compose-dialog-segments` — multi-pass per-speaker dispatcher. Rehosts
   right before building the Sync.so payload's `video` input. Telemetry
   added to v105 probe as `v143_rehost_*` fields.
2. `lipsync-diagnostic` — rehosts before fanning out the 5 ASD variants so
   the diagnostic always tests Sync.so behavior on a stable URL.
3. `compose-dialog-scene` — n/a, already a thin forwarder to segments.
4. `lipsync-watchdog` / `sync-so-webhook` — no own dispatch; rely on
   segments rehost.

## Fail-fast on remaining 422s

After v143 rehost is live, any new `generation_input_video_inaccessible` is
a genuine bug (not URL expiry). `_shared/syncso-preflight.ts` now:

- `classifySyncError`: matches the message and code to `input_inaccessible`
  bucket (NOT routed through retry/NOOP ladder).
- `classifySyncErrorCode`: maps `generation_input_video_inaccessible` and
  `generation_input_audio_inaccessible` to `fail_fast` (refund + UI).
- `explainSyncErrorCode`: surfaces "Plate-URL war beim Dispatch nicht mehr
  abrufbar (Quelle abgelaufen) — Szene bitte neu rendern".

## Verification path

1. Look at any new `syncso_dispatch_log.meta` row — should contain
   `v143_rehost_url` pointing to `…/storage/v1/object/sign/lipsync-plates/…`
   instead of an `s3.eu-central-1.amazonaws.com/...` URL.
2. Re-run a previously-broken 4-speaker dialog scene. Expect: all passes
   complete; no `generation_input_video_inaccessible` in webhook payloads.
3. Re-run the v142 diagnostic on a known-bad plate from the past. Expect:
   at least one variant returns moving lips, proving ASD was never the
   problem and the v134 NOOP-ladder can be simplified in a future cleanup.
