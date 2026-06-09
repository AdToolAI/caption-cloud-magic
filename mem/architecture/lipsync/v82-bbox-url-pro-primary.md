---
name: v82 bbox-url-pro Primary (Phase 2.1)
description: Multi-speaker dialog (N>=2 with resolved plate-identity + plateDims, no per-pass preclip) now dispatches Sync.so with `active_speaker_detection.bounding_boxes_url` pointing at a per-frame JSON in the `composer-frames` bucket. New PRIMARY retry-ladder entry `bbox-url-pro` in both compose-dialog-segments and sync-so-webhook; falls back to inline `bounding_boxes` (legacy `coords-pro-box`) on upload failure and walks the rest of the ladder (coords-pro → coords-pro-box → sync3-coords → coords-pro-lp2pro → auto-pro → auto-standard) on provider failure. Structural fix for "Lipsync hat keinen Avatar getroffen".
type: architecture
---

# v82 — bbox-url-pro PRIMARY (June 2026, Phase 2.1)

## What changed

**compose-dialog-segments/index.ts**
- `RETRY_VARIANTS` gains `"bbox-url-pro"` at position 0.
- New helper `uploadBoundingBoxesJson()` writes
  `{ bounding_boxes: ([x1,y1,x2,y2])[] }` (length = ceil(totalSec * 30))
  to `composer-frames/${userId}/${projectId|'shared'}/asd/${sceneId}-pN-<ts>.json`,
  returns the public URL.
- Fresh-dispatch default variant:
  - `bbox-url-pro` when `speakers.length >= 2 && plateDims && plateIdentityMap.resolvedCount > 0 && !pass.preclip_url`
  - else `coords-pro` (unchanged legacy entry).
- Dispatch branch: same box resolution as `coords-pro-box` (faceMap → plate-space rescale + 15 % pad, synthetic-box fallback around `pass.coords`). For `bbox-url-pro` we upload the per-frame JSON and pass `active_speaker_detection.bounding_boxes_url`. On upload failure we graceful-degrade to inline `bounding_boxes` (legacy shape).
- `payloadModel` default tail = `SYNC3_MODEL` — `bbox-url-pro` lands on sync-3.

**sync-so-webhook/index.ts**
- `V5_RETRY_VARIANTS` updated:
  `["bbox-url-pro", "coords-pro", "coords-pro-box", "sync3-coords", "coords-pro-lp2pro", "auto-pro", "auto-standard"]`
- `nextV5RetryVariant("bbox-url-pro")` → `"coords-pro"`. Existing 3+ speaker repair-audio guards still apply once the ladder drops into `coords-pro`.

## Why

Inline `bounding_boxes` (v31 `coords-pro-box`) works up to medium clip lengths but Sync.so silently rejects very long arrays / certain shapes with `provider_unknown_error`. The official `bounding_boxes_url` JSON-file path (per https://sync.so/docs/developer-guides/speaker-selection) has no payload-size limit and is the recommended multi-speaker / long-form mode. Promoting it to PRIMARY eliminates the structural class of "Lip-sync hit no avatar" failures on multi-face plates with resolved plate identity.

## Skipped (intentional)

- Per-pass preclip path keeps `auto_detect:true` — the 512×512 single-face crop is unambiguous, no ASD needed.
- N=1 path keeps `coords-pro` as default — single face, point-ASD is fine and avoids the extra upload step.
- HDR pre-flight / 4K cap (Plan 2.4) deferred — needs ffprobe / Lambda re-encode, not viable in an edge function.

## Files
- edited  `supabase/functions/compose-dialog-segments/index.ts`
- edited  `supabase/functions/sync-so-webhook/index.ts`
