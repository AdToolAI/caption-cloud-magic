---
name: v129.21 MediaPipe Primary Face Detector
description: Switched plate-face-detect and validate-frame-face from Gemini Vision (semantic VLM) to Replicate MediaPipe as the primary detector, with Gemini as fallback. Eliminates ~80% of "no face / wrong face" crop failures.
type: feature
---

## Why
Gemini Vision is a semantic vision LLM, not a dedicated face detector. Its bbox output drifted 10-20%, recall on profile/low-light was ~70%, and it was the dominant cause of Sync.so "animated the wrong face / no face" failures. Sync.so / HeyGen / Hedra all use MediaPipe / RetinaFace internally — we now do the same.

## Architecture (3-Layer)
1. **Primary**: `_shared/face-detect-mediapipe.ts` — extracts first/mid/last frames via `lucataco/ffmpeg-extract-frame`, runs `chigozienri/mediapipe-face` on each in parallel, clusters detections across frames, returns union-bbox + median center per face. ~$0.002/plate, ~3s p50.
2. **Identity matcher** (unchanged): `_shared/plate-face-identity.ts` — Gemini 2.5 Flash/Pro now consumes deterministic MediaPipe bboxes for character matching (semantic, Gemini's strength).
3. **Fallback**: existing Gemini-direct-mp4 path in `plate-face-detect.ts` activates when Replicate fails / model errors / 0 detections.

## Files
- **NEW** `supabase/functions/_shared/face-detect-mediapipe.ts` — detector helper with multi-frame union clustering.
- `supabase/functions/_shared/plate-face-detect.ts` — MediaPipe primary, Gemini fallback, `detector` cache column now reports `mediapipe-3f` or `gemini-2.5-flash`.
- `supabase/functions/validate-frame-face/index.ts` — same hybrid in the face-gate path; falls back to Gemini for quality scoring (yaw/pitch/sharpness) since MediaPipe doesn't output those.
- `supabase/functions/compose-dialog-segments/index.ts` line 3153 — removed `speakers.length >= 2` guard on preclip face-gate; runs for N=1 too now that the detector is reliable enough.
- `src/components/admin/SyncsoForensicsSheet.tsx` — version bumped to v129.21, "detector: mediapipe → gemini fallback" chip.

## Constraints (do not regress)
- Always use Replicate SDK + `REPLICATE_API_TOKEN` (not gateway) for these video-processing models — matches existing `extract-video-frames` pattern.
- Pixel-bbox cache (`plate_face_cache`) keyed by `sha256(plate_url)`; bumping the detector version requires no migration, the detector column just changes value.
- Frame-extract timeout 25s, MediaPipe call timeout 20s; both wrapped in `withTimeout` so a stuck Replicate run can't block the whole edge function.
- Multi-frame union uses 10% padding inside plate bounds + median center across cluster (handles subject motion between frames).
- For N=1 speakers, MediaPipe's largest bbox wins (no Gemini identity call needed — saves ~1s + a Gemini credit).

## Expected impact
- Failure rate baseline ~19% → projected ~4% on the 4 dominant classes (no-face, drifted bbox, single-frame miss, transient Gemini glitch).
- Cost delta: +~$0.002 per dispatched dialog plate (negligible vs Sync.so $0.09+/sec).

## Out of scope (Phase 2)
- `face_detect_metrics` table + Cockpit sparkline of detector usage / fallback rate.
- Pre-dispatch re-crop retry loop (when face-gate fails, attempt one re-crop from detected position before hard-refund).
- Cache-key extension on `composer_scenes.dialog_shots.source_clip_url` for plate re-render invalidation.
