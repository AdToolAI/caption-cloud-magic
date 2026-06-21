---
name: v154 Plate-Face Geometry Sanity Gate
description: v154 catches Gemini Flash returning torso/body bboxes for plate face detection and retries with Gemini Pro + strict prompt; stale cache + persisted plate_identity get auto-evicted.
type: feature
---

# v154 — Plate-Face Geometry Sanity Gate + Pro Retry

## Why
v153.x used `gemini-2.5-flash` on the mp4 URL to detect speaker face bboxes for Sync.so. On multi-figure (4-speaker) talking-head scenes, Flash routinely returned **torso/upper-body bboxes** with high (0.998+) confidence — center y ≈ 0.55 of plate height — instead of head/face bboxes. Sync.so then "lipsynced" the chest area, so users saw:
- Char 1+2: pristine plate visible under wrong-position mask (mouth keeps moving silently).
- Char 3+4: frozen lips (Sync.so output overlay was on torso, not face).

## What
`supabase/functions/_shared/plate-face-detect.ts`
- New `validatePlateFacesGeometry(faces, w, h)` — fails when:
  - any `center_y/H > 0.65` → `center_far_below_midline`
  - mean `center_y/H > 0.45` → `cluster_below_upper_third`
  - mean bbox height > 30 % of H → `bbox_too_tall`
  - any bbox height > 40 % of H → `bbox_oversized`
  - any aspect h/w > 1.8 → `bbox_aspect_torso_like`
- `askGeminiForPlateFaces(..., { strict, model })` now accepts a model override + strict prompt that hard-forbids shoulders/torso.
- `detectPlateFaces` flow:
  1. MediaPipe primary (unchanged).
  2. Flash on mp4 URL → validate. If gate fails → retry with `google/gemini-2.5-pro` + `PLATE_PROMPT_STRICT`.
  3. If Pro also fails → return `null` (caller falls back / hard-blocks). Suspect results are **never cached**.
- Cache-hit path also re-validates so any stale row from pre-v154 dispatches is auto-evicted (`v154_cache_evict`).

`supabase/functions/compose-dialog-segments/index.ts`
- Bumped `COMPOSE_DIALOG_SEGMENTS_VERSION = "v154"`.
- Before consuming `persistedPlateIdentity.bboxes`, runs the same geometry gate; if it fails, drops persisted bboxes and forces a live re-detect (`v154_persisted_identity_evict`).

## Cleanup migration
Evicts any `plate_face_cache` row and any `composer_scenes.dialog_shots.plate_identity` whose **average** face center y/H ≥ 0.45 so existing affected scenes auto-recover on the next "Sauber neu starten".

## What we did NOT touch
v153.8 mp4-mvhd-probe frame_count fix, Sync-3 doc-strict options, ASD `bounding_boxes_url` shape, refund logic.
