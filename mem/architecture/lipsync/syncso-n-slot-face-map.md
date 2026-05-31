---
name: Sync.so N-Slot Face Map (3+ speaker pipeline)
description: twoshot-face-map.ts generalised from `side: left|right` (2 slots) to `slotIndex` (N slots, 0..N-1 sorted by ascending x). Gemini Vision uses new `{slot, center, bbox}` and `{assignments:[{slot,characterId}]}` schemas, with backwards-compat parsing for legacy `{left, right}` responses. Legacy cached entries lazy-migrate on read. compose-dialog-segments passes `expectedFaceCount`+`totalSpeakers` and uses evenly-spaced heuristic fallback for N≥3. Anchor prompt in compose-video-clips gains a group-shot variant for N≥3 (single horizontal line, equal screen share, no overlap); ANCHOR_AUDIT_VERSION bumped 6→7 to force recompose of stale 2-shot plates for 3-speaker scenes. portraitUrls hard-capped at 4 in compose-scene-anchor (already in place). Sync.so passes[] loop and audio-mux are already N-aware — no change needed.
type: architecture
---

**Trigger:** 3-Charakter cinematic-sync scenes were targeting only 2 faces because `FaceMapFace.side` was hard `"left" | "right"` and `askGeminiForIdentityMatch` returned only `{left, right}`. With 3 detected faces, slot 2 was permanently dropped or mis-assigned.

**Changes:**
- `_shared/twoshot-face-map.ts`:
  - `FaceMapFace` gets `slotIndex: number` (authoritative) + `slotLabel: string` (`left`/`center`/`center-N`/`right`); `side` retained as derived alias for N≤2.
  - `askGeminiForFaces` schema: `{faces:[{slot,center,bbox}]}` with `slot` = index after sort-by-x; takes `expectedFaceCount` hint.
  - `askGeminiForIdentityMatch` schema: `{assignments:[{slot,characterId}], confidence}`; also parses legacy `{left,right}` for backwards-compat.
  - `migrateCachedFaces` lazy-migrates legacy `side`-based cache rows on load (no migration migration needed).
  - `pickSpeakerCoordinates` priority: identity → `slotIndex === speakerIdx` → evenly-spaced heuristic (`0.2 + 0.6*i/(N-1)` of frame width).
- `compose-dialog-segments`:
  - Passes `expectedFaceCount: speakers.length` and `totalSpeakers` into the face-map helpers.
  - Fallback for unset coords now evenly spaced (no more collision at x=0.5 when N=3).
  - Logs `coordSources` per pass for observability.
- `compose-video-clips`:
  - `neutralTwoShotPrompt` gains N≥3 branch: "single horizontal line, left-to-right, equal screen share, clear gaps, no overlap, identical lighting".
  - `ANCHOR_AUDIT_VERSION` 6→7 → stale 2-shot plates rebuilt as group shots for 3-speaker scenes.

**Untouched:**
- Legacy v4 `compose-twoshot-lipsync` inline face-map (still uses its own `side` copy — only used for 2-speaker legacy path).
- Sync.so multi-pass chain in `compose-dialog-segments` (already N-fähig via `passSpeakers.map(...)` with no cap).
- `render-sync-segments-audio-mux` (already N-agnostic — passes ≥2 triggers Lambda mux of master WAV).
- `compose-scene-anchor` portrait hard cap (already 4 max).

**Soft limits / next steps:**
- Practical max N = 4 (portrait hard cap in `compose-scene-anchor`).
- Credit math: Sync.so cost = `ceil(durationSec) × 9 × passes` (Lipsync Pro Policy), so 3 speakers ≈ 1.5× a 2-speaker scene.
- UI: SceneDialogStudio currently has no N-speaker warning toast — add when product asks.
