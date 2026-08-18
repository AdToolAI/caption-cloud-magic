# FA-4 v404 — Server Motion Calibration / Performance Gate (Execution Plan, Precision Patched)

This gate requires *running* measurements (Remotion Lambda still-invokes, JPEG decode, latency
sampling). That is execution work, so it needs approval before it can start. Nothing is measured
yet. Production-code diff stays ZERO.

## Frozen inputs (carried in unchanged)

- Run `8b0f659d-7e40-41e5-9761-e870709824ff`, Scene `e658509d-cdeb-40f7-bd33-98e74144fdc5`
- Labels (provenance only, never numeric anchors): p0/T1 Sarah motion, p1/T5 Sarah motion,
  p2/T2 Samuel motion, p3/T6 Samuel noop, p4/T3 Matthew motion, p5/T4 Kay noop
- Frozen SOURCE-space ROI: centerX 0.5, centerY 0.6, width 0.28, height 0.12
- frame N ↔ source time N/30 s, zero offset

## Step 1 — Artifact map incl. asset dimensions (read-only)

Read-only resolve, per p0..p5: `pass_idx`, turn id, speaker, provider-input preclip URL,
Sync.so provider-output URL, job id, run_id, plate_generation — and for **each of the 12 assets
individually**: exact URL, width, height, aspect ratio, duration (probed read-only from the
asset itself, not assumed). No Sync.so dispatch, no new artifacts, no DB writes.

Per-asset Source→Still is computed from that asset's real dimensions:

```text
s  = max(1280/sw, 720/sh)
dx = (1280 - sw*s) / 2
dy = (720  - sh*s) / 2
u_still = (u_src * sw * s + dx) / 1280
v_still = (v_src * sh * s + dy) / 720
```

The frozen source ROI is transformed separately for preclip and provider output using each
asset's own dimensions. Provider output is **not** assumed to be 720×720.

- If all 12 assets prove to be 720×720: state that explicitly, then the frozen S11 transform
  (`u_still = u_src`, `v_still = 1.7777778·v_src − 0.3888889`) applies to all.
- If a provider output has a different aspect ratio: continue only if the content coordinate
  space demonstrably preserves the same normalized speaker geometry. Otherwise
  `FA-4 v404 CALIBRATION = BLOCKED — provider output coordinate space not comparable → STOP`.
- If any of the 12 URLs is no longer resolvable → BLOCKED, stop.

## Step 2 — Frozen metric semantics

Identical semantics for calibration and later production. Per ROI pixel `p`, over the N stills:

```text
Y          = 0.299R + 0.587G + 0.114B          (Rec.601)
meanY[p]   = SUM_frames(Y_frame[p]) / N
d2         = (Y_frame[p] - meanY[p])^2
mean       = SUM over all frames and all ROI pixels of d2 / (N * pixelCount)
peak       = MAX over all frames and all ROI pixels of d2
```

`peak` is the maximum single squared deviation — explicitly NOT the max of per-pixel averaged
variance, not a 9×9 peak block, not the RCA ffmpeg peak, not frame-difference energy.
Old RCA numbers stay label provenance only.

Per pair: `deltaMean = provider.mean − preclip.mean`, `deltaPeak = provider.peak − preclip.peak`.
No face/landmark detection.

## Step 3 — Frozen ROI integerization

After the per-asset Source→Still transform, on the still (1280×720):

```text
bw = max(8, round(stillWidth  * roiWidth))
bh = max(8, round(stillHeight * roiHeight))
bx = clamp(round(roiCenterX * stillWidth  - bw/2), 0, stillWidth  - bw)
by = clamp(round(roiCenterY * stillHeight - bh/2), 0, stillHeight - bh)
sampling rect: x ∈ [bx, bx+bw), y ∈ [by, by+bh)   // end-exclusive
```

Expected for the S11 720×720 → 1280×720 case: bx ≈ 461, bw ≈ 358, by ≈ 411, bh ≈ 154.
The actual integer values are printed in the report. Calibration and production use identical
rounding — no second rounding path.

## Step 4 — Still sampling path (production-identical)

Per video, per N: N timestamps evenly distributed with 5% duration start padding and 5% end
padding; `frame_i = round(t_i * 30)`; Remotion Lambda `type:"still"`, composition
`DialogStitchVideo`, inputProps payload `{ masterVideoUrl, masterAudioUrl:"", totalSec, shots: [] }`,
`imageFormat:"jpeg"`, `jpegQuality:85`, `scale:1`, no force dims → 1280×720.
No PNG, no other resolution, no direct MP4 decode, no browser canvas, no other composition.

### JPEG decoder parity (chosen before execution)

Exactly one decoder is selected up front and frozen in the report by name + version. It must be
usable in the calibration harness **and** identically usable in the later Deno/Edge production
helper, return deterministic RGB pixels, and perform no automatic resize or color transformation.
Same decoder, same decode options, both sides. Selecting a calibration-only decoder is not allowed.

## Step 5 — N-sweep

Measure all six pairs for N = 6, 8, 10, 12. Emit the full table
(N, pass, label, preMean, prePeak, providerMean, providerPeak, deltaMean, deltaPeak).

## Step 6 — Separation gate

Per N: `minMotion = min Δpeak(p0,p1,p2,p4)`, `maxNoop = max Δpeak(p3,p5)`,
`gap = minMotion − maxNoop`. PASS only when `gap > 0` and p2/T2 sits clearly on the motion side.
If no N reaches `gap > 0` → BLOCKED — server metric does not separate the frozen S11 labels.
No threshold invention, no manual re-labelling.

## Step 7 — N selection and thresholds

Smallest passing N wins (not automatically 12). For that N only:

```text
MOTION_THRESHOLD = server_delta_min_motion - gap/4
NOOP_THRESHOLD   = server_delta_max_noop  + gap/4
```

Report raw values, full-precision thresholds, and display-rounded thresholds; rounding must not
alter the separation. The indeterminate zone between both thresholds stays intact.

## Step 8 — Performance, sample size, concurrency

- Still-invoke latency: the individual latencies produced during the N-sweep may be reused for
  the still-level p50/p95/max.
- Pair wall-time: for the finally selected N/concurrency candidate, **at least 20 independent
  full pair observations** (2×N stills each) before any p95 is stated. With n < 20 the word p95
  is not used and the gate stays open.
- Report explicitly: n of still latencies, n of pair wall-time samples, p50, p95, max.
- Concurrency swept over a small bounded pool (e.g. 2, 4, 6) — no unbounded `Promise.all` will be
  recommended; record error rate and any AWS/Lambda throttling; pick the smallest safe concurrency.

## Step 9 — Cost control without corrupting latency data

Calibration stills may be cached/deduplicated test-only by `(asset URL, frame, composition config)`,
and those cached results may be reused for the metric and N-sweep evaluation. Performance runs
must measure real fresh invokes and may never derive latency from cache hits. This cache is
harness tooling only — no production cache architecture is built from it.

## Step 10 — Deadline

Derive `measurement_deadline_ms` from the measured pair p95/max — finite, comfortably covering p95,
no unbounded Lambda wait. No pre-set number is carried over.

## Test-only scope

New files only under `scripts/calibration/` (plus a fixture JSON of the artifact map).
No edit of and no import into `sync-so-webhook`, `compose-dialog-segments`,
`report-lipsync-motion-probe`, shared production helpers, the G3.2.2 RPC, the Remotion
composition, v402 geometry, or Contract E. Production diff = ZERO.

## Report (A–L)

Artifact map incl. per-asset dimensions · Source→Still parameters used per asset · integer ROI box ·
frozen metric definition · JPEG decoder + version · N-sweep table · separation per N · selected N ·
final thresholds · T2 sensitivity proof · latency statistics with sample counts · selected
concurrency · proposed deadline · failures/throttling · exact test-only diff scope.

## Gate

Ends with exactly one of:
`FA-4 v404 SERVER MOTION CALIBRATION / PERFORMANCE GATE = PASS → STOP`
or `... = BLOCKED — <exact reason> → STOP`.
No implementation-GO, no deploy, no Motion-Studio render, no Sync.so dispatch, no DB mutation.
