# V469 — Pre-Dispatch Mouth-Visibility / Pose-Suitability Gate

Status: IMPLEMENTED (conservative). Scope closed. STOP before S01.

## Why not a yaw cut

V463 produced a **MOVED** result for an S01 input at ~75° yaw. A hard
`yaw >= 60°/70° → block` rule would therefore reject demonstrably processable
inputs. Yaw is carried as a **risk signal / telemetry only** and never decides.

## Contract

> Is the mouth, over enough relevant frames of this pre-clip, actually visible
> and geometrically editable?

Per-frame evidence from the frozen plate face track (`preclip_face_track`):

1. face present (valid tracked box) and identity-stable (V461 already enforces
   identity, geometry, `face_share ≥ 0.24`, `face_size ≥ 144px`),
2. mouth landmark/anchor available for that frame,
3. face box not collapsed — `width/height ≥ 0.45` (frontal S01 0.72–0.95,
   ~75° V463 MOVED case ≈ 0.55, ~90° P0 profile 0.30–0.40),
4. mouth point inside the visible face region with a 6%-of-width margin
   (a mouth pinned to the silhouette edge = lateral self-occlusion),
5. usable-frame rate over the turn `≥ 0.35`.

Violation → `preclip_mouth_not_visible` → `lipsync_input_contract_violation`
→ **no provider dispatch** → canonical V459 euro refund.

**Fail-open by design:** fewer than 6 evaluated/tracked frames (static crop,
NOOP-retry reuse, missing track) returns `unevaluated` and dispatches as before.

## Regression matrix (frozen, `v469-mouth-visibility-gate.test.ts`)

| Case | Expectation |
| --- | --- |
| P0 ~90° profile, mouth barely visible | BLOCK |
| P1 frontal | PASS |
| P2 MOVED | PASS |
| P4 MOVED | PASS |
| historical ~75° yaw MOVED (V463) | PASS |
| yaw 89° with clearly visible mouth | PASS |
| no / insufficient track evidence | PASS (unevaluated) |
| full-plate dispatch | PASS (skipped) |

11/11 green.

## Explicitly out of scope

- **Pass 1 stays unsolved.** Frontal, correct request, correct audio/ASD,
  provider does edit the mouth (`mouth_edit = 4.63`) but
  `mouth_over_frame = 1.817`. V469 does not attempt to solve this; pulling a
  second phenomenon into this gate would re-create the overfit risk.
- **Input mouth/frame ratio is documented only**, not gating:
  P0 0.60, P1 0.51 (NOOP) vs P2 1.41, P4 1.06 (MOVED). Four passes of one
  scene are far too few for a gate. The value is carried in
  `v469_mouth_visibility.metrics.input_mouth_over_frame` when supplied.
- No changes to V465 verdict authority, V466 gray band, ASD projection,
  provider payload or refund logic.

## Next controlled test (not executed yet)

P1 ↔ P2 cross-swap, exactly two provider calls:

- P1 video + P2 audio → ?
- P2 video + P1 audio → ?

Decides whether the residual failure follows the **video** (mouth dynamics),
the **audio** (a provider-relevant property we do not measure yet), or is a
video/audio-combination / provider stochasticity effect.
