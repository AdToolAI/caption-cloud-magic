---
name: Holy Grail Lipsync v166 — Complete Pipeline & Post-Mortem
description: Single source of truth for the working cinematic-sync dialog lipsync pipeline. Covers the full journey from v41 segments to v166 anchor-identity slot bridge, every failed era and why, the three decisive fixes, the final end-to-end flow, and the frozen invariants future agents must not regress.
type: feature
---

# Holy Grail Lipsync — v166

## 1. Executive Summary

After 125+ iterations (v41 → v166) we finally have **frame-accurate multi-speaker lipsync with zero ghosting and zero wrong-mouth animations**. The breakthrough was not a new model or a new payload — it was realising that **(a) speaker script-index ≠ visual face slot** and **(b) the "silent face freeze" overlay we kept adding was the source of the morphs we kept trying to fix with more overlays**. v166 bridges script-order to `character_id` via the anchor face map, hard-fails on ambiguity, and lets Sync.so's own `null`-bbox handling deal with non-speaking faces.

## 2. Five Eras of Failure

### Era 1 — Segments (v41 – v70)
- **Tried**: Official Sync.so `segments[]` payload, multi-speaker ASD with `auto_detect:true`, neighbor-aware preclips, dead-segment blocks, n-slot face maps.
- **Failed because**: `segments` are not frame-accurate for ≥3 speakers; ASD auto-detection drifted between turns; we hit reproducible `provider_unknown_error` whenever audio was longer than the speaker's visible window.
- **Lesson**: Sync.so wants one continuous clip + per-frame bbox truth, not segments.

### Era 2 — Preclip / Single-Face (v68 – v123)
- **Tried**: Per-speaker single-face preclips, hard plate-gate, coords-as-truth, identity-lock, zombie failsafes, circuit breakers.
- **Failed because**: Identity drifted between passes, stale preclips were reused, plate-gate collisions caused circular fallback loops, and the "soft pass" repair paths silently animated the wrong mouth.
- **Lesson**: There must be **one** speaker→face source of truth, computed once per scene, never reinferred per pass.

### Era 3 — Doc-Strict sync-3 (v124 – v131)
- **Tried**: Locked the payload to documented sync-3 options only; removed `temperature` and `occlusion_detection_enabled` (both reproduced `provider_unknown_error`).
- **Failed because**: Provider errors stopped, but wrong-mouth animations on 3+ speaker scenes remained — the bug was upstream of the payload.
- **Lesson**: Doc-strict is necessary but not sufficient. Payload correctness ≠ semantic correctness.

### Era 4 — Parallel Passes & Tight Windows (v38 – v40, v93 – v95, v149)
- **Tried**: Parallel Sync.so passes, per-turn tight-window audio, master-clip watchdog.
- **Failed because**: Latency improved but exposed race conditions in speaker-to-face mapping; tail-clamp and aliasing bugs (v89–v91) appeared.
- **Lesson**: Don't parallelise until the sequential pipeline is provably correct.

### Era 5 — Today (v161 – v165)
- **Tried**:
  - v161–v162: `bbox-url-pro` JSON as single source of truth.
  - v163: single-face preclip with exact frame count.
  - v164: `SilentFaceFreeze` overlay to hide non-speaking mouths.
  - v165: viewport-translate crop to fix ghosting from v164.
- **Failed because**:
  1. **Speaker script-index was blindly used as visual slot index.** Scene with cast `[Samuel, Matthew, Kailee, Sarah]` rendered Speaker 3's animation onto Speaker 1's face.
  2. **Silent overlays double-rendered the master plate** in every face viewport → morphing artifacts.
  3. Render time ballooned to 12:30 because each pass also rendered N silent overlays.
- **Lesson**: Stop adding layers to mask symptoms. Find the mapping bug.

## 3. The Breakthrough — v166

Three decisive changes, no new features:

### a. Anchor-Identity Slot Bridge
`supabase/functions/compose-dialog-segments/index.ts`

When `plate_identity.faces[]` is missing `characterId` (the regression that caused scene `0b0b7f78…`), sort both `plate_identity.faces` and `faceMap.anchorFaces` by `slot`/`slotIndex` and copy `characterId` from anchor → plate. This bridges script order to the correct visual face *before* any pass is dispatched.

### b. Hard-Fail Instead of Guess
Removed the `unlabeled.find(f => f.slot === idx)` fallback. `idx` is script position, not visual position — using it was the original bug. If a turn cannot resolve its speaker to a `character_id`, the pass aborts and the credit is refunded. Wrong animation is worse than no animation.

### c. Silent-Face Overlays Removed
- `render-sync-segments-audio-mux/index.ts`: deleted the `v164SilentSlotsByExcludedIdx` map and `silentSlots` from `overlayPayload`.
- `src/remotion/templates/DialogStitchVideo.tsx`: replaced `SilentFaceFreeze` rendering with an empty list.

Sync.so already handles non-speaking faces via `null` bbox entries in the bbox-JSON. The Remotion overlay was a redundant layer that caused the very ghosting we were trying to suppress.

## 4. Final End-to-End Pipeline

See diagram: `/mnt/documents/lipsync-v166-pipeline.mmd`.

1. **Trigger** — user runs cinematic-sync on a dialog scene → `compose-dialog-scene` edge function.
2. **Lock** — `try_acquire_dialog_lock(scene_id)` RPC; per-scene single-flight.
3. **Plate + Anchor** — Hailuo i2v generates the master plate; Gemini Vision extracts the anchor face map with `characterId` per `slotIndex`. Persisted as `plate_identity` on the scene row.
4. **Per-turn Dispatch** — `compose-dialog-segments` loops the script:
   - Resolve `speaker → character_id` via the Anchor-Identity Slot Bridge (see §3a).
   - `_shared/pass-face-preclip.ts` produces a frame-exact bounding-box JSON for the full clip duration: voiced frames for the active speaker, `null` for every other face.
   - POST to Sync.so `sync-3` with `{ model: "sync-3", input: [master_clip, per_turn_audio], options: { sync_mode: "cut_off", active_speaker_detection: { bounding_boxes_url, auto_detect: false } } }`.
5. **Webhook** — `sync-so-webhook` (verify_jwt=false, shared-secret) patches `dialog_shots` and triggers `poll-dialog-shots` within ~1s (per `sync-so-webhook-stage5`).
6. **Mux** — `render-sync-segments-audio-mux` ffmpeg-concats the per-turn Sync.so outputs back into one continuous clip with the original master audio track. No silent overlays.
7. **Stitch** — `DialogStitchVideo.tsx` (Remotion Lambda) renders the final cinematic clip.
8. **Refund** — any failure path (provider, timeout, mapping ambiguity) triggers idempotent credit refund via the deterministic UUID derived from `video_id` (per FROZEN-INVARIANTS).

## 5. Frozen Invariants — Do Not Regress

1. **sync-3 only**, doc-strict options. `temperature` and `occlusion_detection_enabled` are banned — they reproduce `provider_unknown_error`.
2. **bbox-url-pro is the single source of truth**. `auto_detect: true` is forbidden for multi-speaker.
3. **Speaker → face MUST go through `character_id`**, never raw script index. The Anchor-Identity Slot Bridge is the only resolver.
4. **No silent-face overlays in Remotion.** Sync.so handles non-speaking faces via `null` bbox.
5. **Hard-fail + refund > silent wrong animation.** No "soft pass" repair paths.
6. **Per-scene lock, webhook-driven dispatch.** No polling-driven loops.
7. **One pre-clip per pass, frame-count exact.** No reuse of stale preclips across passes.

## 6. Superseded Docs (kept for history)

These remain on disk as historical record but are **superseded by this document**:

- `v161-*`, `v162-*`, `v163-single-face-preclip-exact-framecount.md`
- `v164-silent-faces-overlay.md` ⚠️ approach now forbidden
- `v165-silent-face-crop-fix.md` ⚠️ approach now forbidden

Older era docs (v41–v131) are accurate snapshots of their time and still useful for understanding *why* a given option exists.

## 7. Verification Markers

Logs to look for on a healthy run:

- `v166_anchor_identity_slot_bridge` — bridge ran and resolved all speakers.
- `v166_silent_slots_disabled` — overlay path is dead.
- `v166_bbox_json` — per-pass bbox JSON has correct frame count and exactly one non-null face per frame.
- Webhook → `poll-dialog-shots` round-trip ≤ 2s.
- Full 9s 4-speaker scene renders in ≈ 3–4 min, not 12:30.
