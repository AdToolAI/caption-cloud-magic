---
name: v90 — Multi-Turn Aliasing Fix + Tail Clamp
description: Per-turn sourceStartSec offsets into the Sync.so tight output prevent turn-N from replaying turn-1 lips; asymmetric pad clamps post-script lip twitch
type: architecture
---

**v90 (June 2026, compose-dialog-segments + render-sync-segments-audio-mux + DialogStitchVideo):** Fixes two artefacts where a speaker's lips moved outside their script.

## A — Multi-Turn Aliasing (root cause)

When a speaker has ≥2 turns in one scene, `compose-dialog-segments` concatenates ALL their turn windows into a single tight WAV (`sliceWavToWindows` with `gapSec=0.05`). Sync.so renders ONE continuous output video for that speaker. Previously the mux mapped each turn as a separate shot with `sourceTiming: "relative"` and `startFrom=undefined`, so every shot replayed the Sync.so output from output-t=0 — turn 2 visibly showed turn 1's lip animation.

**Fix:**
- `audio_tight.output_offsets_sec: number[]` is now computed alongside the tight slice (cumulative sum of `(e-s) + GAP_SEC` per sorted window, mirroring `sliceWavToWindows` layout).
- `render-sync-segments-audio-mux` sorts the per-pass segments by `startTime` (matching sliceWavToWindows internal sort) and emits `sourceStartSec = output_offsets_sec[i]` on each shot.
- `DialogStitchVideo` (Remotion) computes `startFromForRelative = Math.round(sourceStartSec * fps)` for relative-timed shots; passes it to `<Video startFrom={…}>` in all three overlay paths (FullFrame / Cropped / FaceMask).
- Single-turn speakers get `sourceStartSec=0` → identical to v89 behavior.

## B — Tail Clamp

Previously `SEG_PAD=0.08s` (audio) + `SHOT_PAD=0.08s` (overlay) let lips wiggle up to ~160ms past script end inside the Sync.so silence-padded tail. v90 makes both pads asymmetric:
- `SEG_PAD_START=0.08`, `SEG_PAD_END=0.02` (compose-dialog-segments)
- `SHOT_PAD_START=0.06`, `SHOT_PAD_END=0.02` (mux)

Onset stays generous (consonant safety); tail clamps to 20ms so post-script lip activity is essentially invisible.

## Constants

`SEG_PAD_START=0.08`, `SEG_PAD_END=0.02`, `SHOT_PAD_START=0.06`, `SHOT_PAD_END=0.02`, `GAP_SEC=0.05`.

## Bundle requirement

`DialogStitchVideo` schema gained an optional `sourceStartSec` field. Older bundles ignore the prop (Zod optional) but cannot honor the offset — re-deploy the Remotion Lambda bundle via `scripts/deploy-remotion-bundle.sh` for multi-turn speakers to render correctly.

## Validation

- DB: `audio_tight.output_offsets_sec.length === segments.length` per pass.
- Multi-turn speaker (e.g. turn 1 at 0.5–1.8s, turn 2 at 5.2–6.4s) must show turn-2 lip animation matching turn-2 words, not a replay of turn 1.
- No visible mouth motion ≥50ms after each turn end.
