---
name: Per-Turn Tight-Window Lip-Sync (v38)
description: Fixes the "speaker 2 lips move during speaker 3's window" timing bug in 3+ speaker scenes. compose-dialog-segments now (a) sends `frame_number = turn START` (not midpoint) so mouth animation anchors where the audio begins, and (b) adds `segments_secs: [[start, end], ...]` on the VIDEO input per pass (multi-speaker only), restricting Sync.so animation to that speaker's voiced turn windows. render-sync-segments-audio-mux + DialogStitchVideo.FaceMaskOverlay overlay each pass output ONLY inside its turn window(s) (~0.08s pad), with `startFrom={turnStartFrame}` so the silence-padded Sync.so output plays at the correct absolute timeline. Single-speaker monologues (1 pass) and 2-speaker scenes still work unchanged at the architectural level — they just gain the windowing safety net.
type: architecture
---

**Symptom (v37 and earlier):** 3-speaker scene rendered visually fine for speakers 1 and 3, but speaker 2's mouth stayed closed during their VO and started moving only after speaker 3's audio began.

**Root cause (cross-verified via Sync.so docs + code audit):**
1. `compose-dialog-segments/index.ts:1280` used the turn **midpoint** as `frame_number`. Sync.so's `lipsync-2-pro` appears to anchor its mouth animation timeline around that frame, displacing speaker 2's animation ~half-a-turn forward into speaker 3's window.
2. `render-sync-segments-audio-mux/index.ts:186` composited every speaker's full-length face-mask overlay across `[0, totalSec]`, so any time-displacement inside a pass was fully visible in the final video.
3. Per-speaker WAVs are silence-padded across the full plate; with no `segments_secs` on the video input, Sync.so was free to animate any frame, which combined with (1) produced the displacement.

**Fix (Sync.so-canonical, surgical):**
- **`compose-dialog-segments/index.ts`** (~line 1276): `frame_number = floor(firstTurn.startTime * 24)` (turn start, not midpoint). Build `speakerWindowsSecs = pass.segments[].map(t => [t.startTime - 0.08, t.endTime + 0.08])`. For multi-speaker scenes (`passes.length >= 2`), attach `segments_secs: speakerWindowsSecs` to the video input — Sync.so then only animates inside those windows; outside them the original plate is preserved.
- **`render-sync-segments-audio-mux/index.ts`** (~line 186): `flatMap(p => p.segments.map(t => ({ startSec: t.startTime - 0.08, endSec: t.endTime + 0.08, ... })))` — one shot per turn, sharing the same `outputUrl` + `faceMask`. Replaces the old single `[0, totalSec]` shot per pass.
- **`src/remotion/templates/DialogStitchVideo.tsx`** (~line 175): `FaceMaskOverlay` now accepts `startFrom` and passes it to `<Video>`. Consumer (~line 281) passes `startFrom={startFrame}` (absolute timing) so the silence-padded Sync.so output plays from the same absolute frame as the master plate.

**Why this also stabilises Sync.so:**
- `segments_secs` is explicitly documented at https://sync.so/docs/api-reference/endpoints/generate as the way to limit which parts of the video get lip-synced. It is the supported alternative to the (crash-prone) top-level `segments[]` + `bounding_boxes` pattern.
- `frame_number = turn-start` matches the spec wording: a frame where the speaker is visible AND about to speak.

**Out of scope (deferred):**
- True canonical single-call `segments[]` with multi-audio `refId` mapping (would replace the v25 fan-out architecture entirely; high regression risk for working 1- and 2-speaker scenes).
- Per-turn tight WAV slicing (compose-twoshot-audio still produces full-length silence-padded WAVs; `segments_secs` + compositor windowing make this unnecessary now).

**Verification:** render a 3-speaker scene and inspect each `dialog_shots.passes[].output_url` individually. Expectation: outside its turn window, the pass's mouth is at rest; inside its window, mouth animation lines up tightly with the voiced audio. Final mux should show all three speakers lip-syncing in their own time slots.
