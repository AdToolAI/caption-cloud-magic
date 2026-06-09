---
name: v87 Coords Refresh + Heuristic Block (June 9 2026)
description: compose-dialog-segments now refuses to dispatch Sync.so passes when every speaker coord falls back to the centre-grid heuristic (y = plate.height * 0.5), and the isAdvance/isRetry branch now refreshes pass.coords from freshly-resolved speakerCoords instead of zementing the bad first-pass coords.
type: architecture
---

# v87 — Coords Refresh + Heuristic Block

## Why

User saw "all 4 characters with closed mouths" on a multi-speaker dialog
scene. Edge logs of scene `4c310576-…`:

```
pass 1 dispatch: faceMap=none faces=0 ... coords=[[154,514],[307,514],[461,514],[614,514]] sources=[heuristic]
pass 2-4:        faceMap=cache faces=4 ... coords=[[482,308],[295,309],[641,344],[161,325]] sources=[identity]
pass 2-4 DISPATCH still used coords=[154|307|461|614, 514]
```

Two bugs stacked:

1. **Pass 1 fresh dispatch.** Gemini anchor-faces probe wasn't cached yet
   and `resolvePlateFaceIdentities` returned 0. Every coord fell back to
   the "Final safety fallback" grid (`speakerCoords[i] = [w*t, h*0.5]`).
   On a 768×1028 portrait plate that's y=514 — mid-torso, no face there.
   Sync.so dispatched but animated nothing.
2. **Passes 2–4 webhook advance.** By then the faceMap was cached with
   real coords, but the `isAdvance` branch cloned `prevState.passes` and
   never updated `pass.coords`. The bad heuristic coords from pass 1 were
   carried through all 4 passes.

## Fix (compose-dialog-segments only)

1. **Heuristic block (fresh path).** After `speakerCoords` is built, if
   `speakers.length >= 2 && coordSources.every(s => s === 'none' || s === 'heuristic')`,
   refund the wallet debit, bump `composer_scenes.meta.face_detect_retry_count`,
   set scene `lip_sync_status='pending'` with `clip_error='awaiting_face_detection_retry_<N>_of_3'`,
   and return 202. Auto-trigger picks the scene up again on the next 8 s
   tick. After 3 awaiting cycles, hard-fail with
   `no_face_map_after_3_retries`.
2. **Coords refresh (advance/retry).** Immediately after the
   `isAdvance|isRetry|fresh` branch, iterate `passes` and overwrite
   `pass.coords` with `speakerCoords[pass.speaker_idx]` **only** when the
   fresh `coordSources[idx]` is *not* `heuristic`/`none`. Heuristic coords
   are already blocked upstream, so this only ever upgrades to better
   coords — never silently downgrades.
3. **Sanity guard (per-pass).** Right before dispatch, if the picked
   pass's `coordSources[speaker_idx]` is still `heuristic`/`none` for a
   multi-speaker scene, skip dispatch and return 202 `awaiting_face_detection`
   (auto-trigger retries). Belt-and-suspenders behind (1) and (2).

## Telemetry

Each block writes a `syncso_dispatch_log` row with
`sync_status='HEURISTIC_BLOCKED'` and
`error_class='coords_heuristic_unverified'`.
`composer_scenes.meta.face_detect_retry_count` tracks the awaiting cycles
and resets to 0 on the final hard-fail (and is implicitly reset on the
next successful non-heuristic dispatch by virtue of staying at the same
value — it only ever increments inside the block).

## Out of scope

- No changes to v86 speaker-dedup logic.
- No Sync.so retry-ladder / model changes.
- No `resolvePlateFaceIdentities` refactor — we now tolerate its failure
  cleanly (refund + retry) instead of blind-dispatching against centre-frame.
- No UI changes.

## Verification

- 4-speaker scene where anchor faces aren't cached on first call → 202
  + refund + scene stays `pending`; second invocation has faceMap cached
  → dispatches with real coords.
- Advance path on a scene whose pass 1 had heuristic coords cannot happen
  anymore (fresh path blocks before passes are persisted). For scenes
  that were already persisted with heuristic coords, the next webhook
  advance call now refreshes `pass.coords` from freshly resolved
  `speakerCoords` before dispatch.
- 1-speaker scenes are exempt — centre-of-frame is a sane single-face
  fallback there.
