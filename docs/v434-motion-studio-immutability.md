# V434 — Immutable Artifacts, Rebuilt Calibration, Scale-Free Outcome Gate

Follow-up to `docs/v433-motion-studio-rca.md`. Scope: the four defects the RCA
established. Everything here is **additive** — the frozen FA-4 lip-sync path
(`.lovable/LIPSYNC-FEATURE-FREEZE.md`) keeps its behaviour bit-for-bit.

## Step 1 — Immutable artifact paths per run/pass

**Defect.** Provider outputs and pre-clips were re-hosted under a key derived
from scene + pass only (`composer/<uid>/<scene>-lipsync-pass-<n>.mp4`). Any later
run overwrote the bytes behind a URL that ledger rows, calibration samples and
RCA evidence still referenced. Ground truth was therefore not verifiable.

**Fix.** `supabase/functions/_shared/v434-immutable-artifact.ts`

```
<uid>/v434/<sceneId>/run-<runId>/gen-<generation>/pass-<passIdx>/<kind>-a<attempt>.mp4
```

- `buildImmutableArtifactKey()` — pure, deterministic, collision-free across
  run / generation / pass / attempt / kind.
- `pinImmutableArtifact()` — downloads, sha256-hashes and uploads with
  `upsert: false`. Never throws, never mutates scene state; a pre-existing
  object counts as `already_pinned`.
- Call sites: `sync-so-webhook` pins the provider output right after the legacy
  re-host; `compose-dialog-segments` pins the pre-clip right after the render.
  Neither changes the URL used for dispatch, mux or playback.
- Evidence is recorded in `public.v434_artifact_pins`
  (scene, run, generation, pass, kind, object key, sha256, byte size, status;
  admin-read only, service-role write).

## Step 2 — v404 calibration retired; reproducible calibration rebuilt

The v404 thresholds (`MOTION_THRESHOLD = 15.4057…`, `NOOP_THRESHOLD = 3.6826…`)
are **retired as ground truth**. They remain in `motion-probe-classifier.ts`
because the frozen production gate still runs on them, but they may not be used
to justify any new decision: they were fitted on samples whose bytes had been
overwritten (T6 42.5 → 169.5, T4 20.0 → 73.6).

New infrastructure:

- `supabase/functions/_shared/v434-calibration-manifest.ts` — pure manifest
  validation + threshold derivation.
- `scripts/calibration/v434/manifest.json` — every v404-era S11 sample is
  recorded as `legacy_non_reproducible` and excluded from derivation.
- `bun scripts/calibration/v434-manifest.mjs` — verifier / deriver.

Guard rails the old calibration lacked:

1. only `reproducible` samples (immutable key **and** sha256 **and** run id) count,
2. at least 3 samples per class,
3. classes must be strictly separable — overlap yields **no** threshold rather
   than a fitted one.

Current output, and the correct state today:

```
valid: true
samples: reproducible=0 legacy_non_reproducible=6 pending=0
derivation: insufficient_samples — need >= 3 reproducible samples per class
```

## Step 3 — Scale-free outcome metric (telemetry only)

`supabase/functions/_shared/v434-mad-ratio.ts` computes the consecutive-frame
mean-absolute-difference of the mouth band and the dimensionless

```
MADratio = MAD(provider output) / MAD(provider input pre-clip)
```

On the reproduced S11 set this separates the Samuel T2 no-op (1.30) from the
lowest genuine motion (1.68) — where the absolute `deltaMean` places the same
no-op (+42.8) 2.8× above the motion threshold.

**It is not authoritative.** No threshold is exported, no verdict is produced.
The metric is computed on the stills the v404 measurement already decoded — zero
extra Lambda invokes, zero extra downloads — and logged as
`v434_telemetry … authority=telemetry_only`. Promotion requires a reproducible
manifest (Step 2) and a separate gate.

## Step 4 — Geometry-coupled mouth ROI

**Defect.** The measurement band was fixed at source-space
`centerY = 0.60`, while `compute-mouth-centered-crop.ts` places the mouth at the
crop **centre**. The gate was sampling nose / upper lip.

**Fix.** `supabase/functions/_shared/v434-motion-roi.ts` derives the band from
geometry the pre-clip renderer already persists (`preclip_anchor`,
`preclip_face_share`, `preclip_crop.size`, `preclip_mouth_offset_px`):
band size scales with `sqrt(face_share)`, band centre follows the mouth.

Fail-closed: missing geometry, a non-mouth anchor, or a mouth offset whose
**direction** is unknown all fall back to the frozen v404 ROI with an explicit
reason. `measureProviderMotionSync` uses the geometry ROI for the MAD telemetry
only; the authoritative v404 metric keeps the frozen band unless
`useGeometryRoiForVerdict: true` is passed explicitly (no production caller does).

A signed mouth offset (`preclip_mouth_offset_xy`) is supported by the deriver
but is not yet plumbed through the pre-clip render chain — that plumbing touches
frozen code and is deliberately deferred.

## Step 5 — Samuel T2 cross-test A/B/C/D: NOT EXECUTED

Blocked by Step 1, by construction: a controlled cross-test is only meaningful
against inputs that cannot change underneath it, and **no immutable pins exist
yet** — every S11 artifact predates the pinning scheme and is therefore
`legacy_non_reproducible`. Running the cells now would reproduce exactly the
failure mode this gate exists to remove (conclusions drawn on mutable bytes).

Pins begin accruing on the next lip-sync runs. The cross-test is unblocked once
`v434_artifact_pins` holds pre-clip **and** provider rows for the same
`(run_id, generation, pass_idx)`.

## Verification

- `bunx vitest run src/test/v434-motion-studio.test.ts` — 25 tests: key
  determinism / collision-freedom, rejection of the retired mutable scheme,
  MAD scale-invariance, the golden-failure separation, ROI fallbacks, manifest
  integrity and non-separability refusal.
- `bunx vitest run src/lib/composer/__tests__/lipsyncFrozenContract.test.ts` —
  10 tests, unchanged: the freeze holds.
