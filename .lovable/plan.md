# FA-4 v404 — Server Motion Calibration / Performance Gate (Execution Plan)

This gate requires *running* measurements (Remotion Lambda still-invokes, JPEG decode, latency
sampling). That is execution work, so it needs approval before it can start. Below is exactly
what will be run, in order, with zero production-code diff.

## Frozen inputs (carried in unchanged)

- Run `8b0f659d-7e40-41e5-9761-e870709824ff`, Scene `e658509d-cdeb-40f7-bd33-98e74144fdc5`
- Labels (provenance only, never numeric anchors): p0/T1 Sarah motion, p1/T5 Sarah motion,
  p2/T2 Samuel motion, p3/T6 Samuel noop, p4/T3 Matthew motion, p5/T4 Kay noop
- Source→Still (PASS/FROZEN): 720×720 → 1280×720, `u_still = u_src`,
  `v_still = 1.7777778 * v_src - 0.3888889`
- Still ROI: center (0.5, 0.6777778), size (0.28, 0.2133333) → px x 460.8..819.2, y 411.2..564.8
- frame N ↔ source time N/30 s, zero offset

## Step 1 — Artifact map (read-only)

Read-only queries against the ledger / dispatch log for that run to resolve, per p0..p5:
`pass_idx`, turn id, speaker, provider-input preclip URL, Sync.so provider-output URL, duration,
job id, run_id, plate_generation. No Sync.so dispatch, no new artifacts, no DB writes.
If any of the 12 URLs is no longer resolvable → BLOCKED, stop.

## Step 2 — Calibration harness (test-only)

New file(s) only under `scripts/calibration/` (plus a fixture JSON of the artifact map).
No import into, and no edit of, `sync-so-webhook`, `compose-dialog-segments`,
`report-lipsync-motion-probe`, shared production helpers, the Remotion composition,
v402 geometry, or Contract E. Production diff stays ZERO.

Harness behaviour, per video:
1. `N` timestamps evenly distributed between 5% and 95% of duration
2. `frame_i = round(t_i * 30)`
3. Remotion Lambda `type:"still"`, composition `DialogStitchVideo`,
   inputProps payload `{ masterVideoUrl, masterAudioUrl:"", totalSec, shots: [] }`,
   `imageFormat:"jpeg"`, `jpegQuality:85`, `scale:1`, no force dims → 1280×720
4. Decode JPEG locally, sample only the frozen still ROI box
5. Rec.601 luma `Y = 0.299R + 0.587G + 0.114B`
6. Temporal per-pixel variance across the N stills → `mean`, `peak`
7. Per pair: `deltaMean`, `deltaPeak` = provider − preclip

No face/landmark detection, no PNG, no direct MP4 decode, no browser canvas.

## Step 3 — N-sweep

Measure all six pairs for N = 6, 8, 10, 12. Emit the full table
(N, pass, label, preMean, prePeak, providerMean, providerPeak, deltaMean, deltaPeak).

## Step 4 — Separation gate

Per N: `minMotion = min Δpeak(p0,p1,p2,p4)`, `maxNoop = max Δpeak(p3,p5)`,
`gap = minMotion − maxNoop`. PASS only when `gap > 0` and p2/T2 sits clearly on the motion side.
If no N reaches `gap > 0` → BLOCKED — server metric does not separate the frozen S11 labels.
No threshold invention, no manual re-labelling.

## Step 5 — N selection and thresholds

Smallest passing N wins (not automatically 12). For that N only:

```text
MOTION_THRESHOLD = server_delta_min_motion - gap/4
NOOP_THRESHOLD   = server_delta_max_noop  + gap/4
```

Report raw values, full-precision thresholds, and display-rounded thresholds; rounding must not
alter the separation. The indeterminate zone between both thresholds stays intact.

## Step 6 — Performance and concurrency

- Per still-invoke latency: count, min, p50, p95, max — over several repetitions, never a single run.
- Per video (N stills) and per pair (2×N stills) wall-clock under the tested concurrency.
- Concurrency swept from a small bounded pool (e.g. 2, 4, 6) — no unbounded `Promise.all` will be
  recommended; record error rate and any AWS/Lambda throttling.
- Pick the smallest safe concurrency.

## Step 7 — Deadline

Derive `measurement_deadline_ms` from the measured pair p95/max — finite, comfortably covering p95,
no unbounded Lambda wait. No pre-set number is carried over.

## Report (A–L)

Artifact map · Source→Still parameters used · N-sweep table · separation per N · selected N ·
final thresholds · T2 sensitivity proof · latency statistics · selected concurrency · proposed
deadline · failures/throttling · exact test-only diff scope.

## Gate

Ends with exactly one of:
`FA-4 v404 SERVER MOTION CALIBRATION / PERFORMANCE GATE = PASS → STOP`
or `... = BLOCKED — <exact reason> → STOP`.
No implementation-GO, no deploy, no Motion-Studio render, no Sync.so dispatch, no DB mutation.

## Cost note

Worst case (N-sweep 6+8+10+12 over 12 videos) is 432 Lambda still-invokes plus repetitions for
latency statistics. All are `type:"still"` on the already deployed bundle; no scene is touched.
