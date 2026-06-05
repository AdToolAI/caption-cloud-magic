---
name: v51 Plate-Side Face Detection for Bounding-Box ASD
description: 3+ speaker dialog scenes now derive Sync.so per-segment `bounding_boxes` from REAL faces detected on the Hailuo plate (Gemini 2.5 Flash Vision on a mid-video frame, cached in `plate_face_cache`, 30d TTL) instead of rescaling anchor-image boxes. Fixes the v50 "video finished but mouths motionless" regression where rescaled anchor boxes landed on empty background pixels because Hailuo framing drifts ~5–15% per render. Fallback chain: plate-detect → anchor-rescale (v50) → Sync.so auto_detect. Engine string `sync-official-segments-v51`, state `version: 51`, `twoshot_stage: syncso_v51_official_segments`. Webhook accepts v41..v51.
type: architecture
---

## Why v51

v50 dispatched `lipsync-2-pro` + per-segment `bounding_boxes` derived from the cached anchor face-map (Nano Banana 2 still, typically 896×1200) linearly rescaled to the Hailuo plate (e.g. 768×1028). On 3+ speaker shoulder-to-shoulder plates the rescaled boxes landed 50–150 px above the actual mouth region — Sync.so found no face inside the given rectangle and silently no-op'd that segment. User-facing symptom: rendered video looks fine, but lips do not move (sometimes all speakers, sometimes only the side speakers). This was the June 5 regression that broke confidence in v50.

## Detection pipeline

New module `_shared/plate-face-detect.ts` (`detectPlateFaces`):

1. Read-through cache table `plate_face_cache` keyed on `plate_url` (30-day TTL).
2. On cache miss: call `lucataco/ffmpeg-extract-frame` on Replicate, asking for a frame at `min(2.0, duration/2)`s → JPEG URL.
3. Pass the JPEG to **Gemini 2.5 Flash Vision** with a strict JSON schema that returns normalized `[x1, y1, x2, y2]` per face (`0..1` coords + plate dimensions).
4. Scale to plate pixels, persist into `plate_face_cache`.
5. Return `{ faces, width, height, cached }`.

Cost per uncached scene ≈ €0.0005 (Gemini Flash) + €0.001 (frame extract). Cached scenes are free.

## Speaker → plate-face mapping

The anchor face-map already enforces left-to-right `characterId` order (Stage G). Hailuo preserves relative ordering across renders even when individual positions drift. v51 therefore maps:

```
speakers[i] → plateFaceMap.faces[i]   // both already L→R sorted
```

Pad 20 % (vs 15 % for the rescaled fallback) — plate detection is precise enough that a smaller pad still covers head movement.

## Fallback chain (per speaker, per segment)

| Source | When | Pad |
|---|---|---|
| `plateFaceMap.faces[i]` | `plateFaceMap.faces.length >= speakers.length` | 20 % |
| Anchor face-map rescaled to plate | Plate detect fails or returns < N faces | 15 % |
| `auto_detect` (segment omits `optionsOverride`) | Neither source yields a usable box | — |

Per-segment fallback is independent: speaker_1 can use a plate-detect box while speaker_3 falls back to anchor-rescale, and both stay deterministic.

## Persisted state (`composer_scenes.dialog_shots`)

```
version: 51
engine: "sync-official-segments-v51"
asd_mode: "bounding_boxes_per_segment"
twoshot_stage: "syncso_v51_official_segments"
v50_box_map: [...]              // diag, retained name for backwards compat
v50_segments_with_box: N
v50_segments_auto_fallback: M
```

`v50_*` diagnostic field names are kept verbatim so the existing analytics queries and Cockpit panels keep working.

## Webhook & dispatcher gate

`sync-so-webhook` and `compose-dialog-segments` accept versions 41..51 and engine strings `sync-official-segments | sync-official-segments-v50 | sync-official-segments-v51`. In-flight v50 jobs continue to finalize correctly.

## Log markers

- `v51 plate_detect=ok plate_faces=N expected=M cached=true|false`
- `v51 plate_detect=fallback-anchor ...` (= used legacy v50 rescale)
- `v50_official_segments_payload model=lipsync-2-pro asd=bounding_boxes_per_segment` (legacy marker reused for log-grep compat)

## Supersedes

v50 (anchor-rescale boxes). All earlier iterations (v41..v49) remain documented for context but are no longer dispatched.
