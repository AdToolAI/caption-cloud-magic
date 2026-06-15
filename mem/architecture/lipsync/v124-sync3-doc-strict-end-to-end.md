---
name: v124 sync-3 doc-strict end-to-end
description: Hard whitelist sanitizer + ASD mutex + per-frame bounding_boxes with null gaps for compose-dialog-segments → Sync.so /v2/generate
type: constraint
---

# v124 — sync-3 doc-strict end-to-end (`compose-dialog-segments`)

Supersedes/extends [v106](./sync-3-doc-strict-options-v106.md) — that one
only blacklisted `temperature` + `occlusion_detection_enabled` for the
Preclip branch. The full-plate `bbox-url-pro` / `coords-pro-box` branch
still emitted them and triggered `provider_unknown_error`.

## Sources of truth

- https://sync.so/docs/models/sync-3.md
- https://sync.so/docs/developer-guides/speaker-selection.md
- https://sync.so/docs/api-reference/api/generate-api/create.md

## Hard rules (enforced in code via `sanitizeSync3Options`)

1. `options` whitelist for `model: "sync-3"`:
   - `sync_mode` (string)
   - `active_speaker_detection` (object)
   - Anything else → silently dropped + logged as `v124_sync3_sanitize stripped_opts=[…]`.
   - **Forbidden**: `temperature`, `reasoning_enabled`, `occlusion_detection_enabled`.

2. ASD DTO mutex:
   - `{ auto_detect: true }` (video only) — no other ASD fields allowed.
   - `{ auto_detect: false, frame_number, coordinates }` — for single reference.
   - `{ auto_detect: false, bounding_boxes }` or `{ auto_detect: false, bounding_boxes_url }`
     — when boxes are provided, `frame_number`/`coordinates` are dropped.
   - Unknown ASD keys (anything outside `auto_detect`, `v3`, `frame_number`,
     `coordinates`, `bounding_boxes`, `bounding_boxes_url`) → dropped + logged
     as `v124_sync3_sanitize stripped_asd=[…]`.

3. Per-frame `bounding_boxes` schema (Sync.so doc, Speaker Selection):
   - Length **must** equal the video frame count.
   - Each entry: `[x1, y1, x2, y2]` if the speaker's face is in that frame,
     `null` if not.
   - Until v124 we filled every frame with the same static box → sync-3 saw
     the speaker "everywhere" and animated neighbour faces during turns the
     speaker was silent (root cause of "pixelated overlay over plant/mouth
     of other speakers" in 4-speaker scenes; only the last speaker animated
     correctly because their voiced window happened to cover the end).
   - v124 builds the per-frame array from `speakerWindowsSecs` (the per-pass
     voiced windows already computed for the tight WAV slice) via
     `buildPerFrameBoxes()` with a ±2 frame safety pad. Frames outside any
     voiced window are `null`. Used for both `bounding_boxes_url` upload
     (`uploadBoundingBoxesJson`) and the inline `bounding_boxes` fallback.

## Log tags to grep for

- `v124_sync3_sanitize stripped_opts=[…] stripped_asd=[…]` — proof that the
  outgoing payload is doc-clean. Empty arrays = nothing was stripped.
- `v124_BBOX_URL_ASD … voiced_frames=N` — per-pass non-null frame count.
- `v124_BBOX_INLINE … voiced_frames=N` — inline fallback path.

## Related files

- `supabase/functions/compose-dialog-segments/index.ts`
  - `sanitizeSync3Options()` (top of file, after `RETRY_VARIANTS`)
  - `buildPerFrameBoxes()` (next to it)
  - `uploadBoundingBoxesJson()` accepts `voicedWindowsSec` + `fps`
  - bbox-url / inline call site (~L3374)
  - sanitizer invocation right before `fetch(${SYNC_API_BASE}/generate)`

## UI side-effect (same release)

`src/components/video-composer/SceneInlinePlayer.tsx`:

- `isWorking` is now gated by `!isFailed` so a `clip_status='failed'` scene
  no longer renders the "Szene wird gebaut…" spinner.
- New failure overlay shows the real `clipError` text plus a "Neu rendern"
  button — root cause of the recent "8-min Spinner über fehlgeschlagener
  Anchor-Identity" report.
