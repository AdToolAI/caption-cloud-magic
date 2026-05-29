---
name: Sync.so Segments — Per-Segment Face Targeting (v5 fix)
description: compose-dialog-segments now resolves a per-scene face map via shared `_shared/twoshot-face-map.ts` (Gemini Vision on scene anchor + identity match against brand_character portraits, cached in audio_plan.twoshot.faceMap) and attaches `options.activeSpeakerDetection.coordinates: [x,y]` per segment so each speaker's audio drives the correct face. sync-so-webhook downloads the Sync.so output to ai-videos/composer/{userId}/{sceneId}-lipsync.mp4 so token-signed Sync.so URLs (~24h expiry) never break replays. usePipelineProgress treats lip_sync_status=applied|failed as terminal and force-resolves progress to 1 when every dialog scene is settled (fixes 95% stuck bar).
type: architecture
---

**Root cause of "first character speaks the whole script":** v5 (`compose-dialog-segments`) dispatched a single Sync.so call without per-segment face coordinates → Sync.so picked the first detected face and routed ALL audio segments onto it. v4 worked because each per-turn call carried `targetCoords` at the top level.

**Fix:**
- New shared helper `supabase/functions/_shared/twoshot-face-map.ts` with `resolveSceneFaceMap()` and `pickSpeakerCoordinates()`. Reads cache from `audio_plan.twoshot.faceMap`, else Gemini Vision (face boxes) + Gemini Vision (identity match against brand_character portraits) → writes back to cache.
- `compose-dialog-segments` now resolves the face map using `scene.lock_reference_url || scene.reference_image_url` as anchor, then attaches per-segment `options.activeSpeakerDetection.coordinates: [x,y]` derived from `speaker.character_id`. Top-level `options.activeSpeakerDetection` set to speaker 0's coords as fallback.
- Heuristic fallback when face map cannot be built: speaker 0 → 30% width center, speaker 1 → 70% width center.

**Storage rehosting:** `sync-so-webhook` v5 COMPLETED branch fetches the Sync.so MP4 and uploads to `ai-videos/composer/{userId}/{sceneId}-lipsync.mp4`, then writes that public URL into `clip_url`. Original Sync.so URL kept in `dialog_shots.sync_so_url` for debugging. Best-effort: on any download/upload failure we keep the Sync.so URL.

**Progress bar fix** (`src/hooks/usePipelineProgress.ts`): added `isTerminalScene()` that treats `lipSyncStatus='applied'|'failed'` and `twoshotStage='complete'|'done'|'failed'` as authoritative terminal regardless of stale `dialog_shots.status`. The lipsync phase forces `progress=1` once every dialog target is settled (failed counts as settled, surfaced separately via `failed` flag) — eliminates the 95% soft-floor pin when one scene is done and another is in a stale v4 queued state.

**Affected files:**
- created `supabase/functions/_shared/twoshot-face-map.ts`
- edited `supabase/functions/compose-dialog-segments/index.ts` (imports + face map resolution + per-segment coordinates)
- edited `supabase/functions/sync-so-webhook/index.ts` (v5 storage rehost)
- edited `src/hooks/usePipelineProgress.ts` (terminal classifier + settled-forces-100 guard)
