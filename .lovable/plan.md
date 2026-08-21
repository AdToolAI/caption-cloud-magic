# V434 — Motion Studio: Immutable Artifacts, Rebuilt Calibration, Scale-Free Outcome Gate

Follow-up to the V433 RCA. Four bounded changes plus one controlled cross-test.
No threshold tweaking of the existing v404 scalar — the calibration it rests on
is discarded, not re-fitted.

## Scope guard

The FA-4 / lip-sync feature freeze stays in force for everything not listed
here. Dispatch logic, provider selection, preclip cropping strategy, retry
rungs and the mux path are not touched. This gate changes where artifacts are
written, how the outcome is measured, and how the ROI is placed.

## Step 1 — Immutable artifact paths per run and pass

Today every provider result is written to a run-independent path
(`composer/<uid>/<sceneId>-lipsync-pass-<N>.mp4`), so a re-run silently
overwrites the bytes any earlier analysis referenced. That is the mechanism
that corrupted the v404 ground truth and it will corrupt any future forensics,
retry comparison or QA the same way.

- Write provider outputs to a path that carries run id and plate generation, so
  a given URL can never change content.
- Same rule for pass preclips (they are already regenerated per run, but under
  names that do not encode the run).
- Record the resulting URL plus a content hash and byte size on the pass record
  at write time, so any later measurement can prove it read the same bytes.
- Keep a stable "latest" pointer for playback/mux so no consumer breaks; the
  immutable URL is the analysis-grade reference.
- Backfill is out of scope. Historical passes stay as they are and are marked
  as non-reproducible.

## Step 2 — Rebuild the calibration from immutable samples

- Retire the frozen v404 fixture and the two thresholds derived from it. They
  are documented as invalid, with the V433 evidence, rather than silently
  edited.
- Collect a fresh labelled set from runs produced after Step 1: each sample
  pinned by run id, pass index, immutable preclip URL, immutable provider URL
  and content hash.
- Labels come from human review of mouth strips, not from any existing metric.
- Target a clearly larger set than the six S11 passes and a real mix of speakers,
  crop sizes and turn lengths — otherwise the new gate is only calibrated to one
  scene again.
- Store the set as a versioned fixture whose entries reference hashes, and add a
  guard test that fails when a fixture entry's referenced bytes no longer match
  its recorded hash.

## Step 3 — Outcome gate on a scale-free signal

- Candidate: ratio of the provider's mean consecutive-frame mouth-band
  difference to the same statistic on its own preclip. On the S11 set it
  separates cleanly (no-op 1.30 vs lowest genuine motion 1.68), and unlike the
  current delta-of-variance it cancels re-encode gain and background energy.
- The candidate is validated against the Step 2 set before it becomes
  authoritative. Decision rule and thresholds are derived from that set, with
  the derivation script and its output committed.
- Until validation passes, the new statistic runs as telemetry alongside the old
  verdict; the switch to authoritative is a separate, explicit change.
- Keep the measured-vs-unmeasurable distinction: a missing or failed measurement
  stays indeterminate and never silently reads as motion.

## Step 4 — Couple the mouth ROI to real face geometry

- The ROI is currently a fixed fraction of the frame (`centerY 0.6`), so on the
  S11 passes it sits on the nose/upper-lip line rather than on the aperture.
- Derive the ROI from the geometry the preclip step already computes — the
  mouth-centered crop helper produces a face share and a mouth offset — and
  persist the ROI actually used on the pass record.
- On the S11 passes those fields were written as zero with a `face_center`
  anchor, so part of this step is establishing why the mouth anchor did not
  apply there and making the fallback explicit and observable rather than
  silent.
- Re-measure the S11 set with the geometry-coupled ROI and report how the
  separation changes; the ROI change lands together with the Step 2 fixture so
  calibration and measurement stay consistent.

## Step 5 — Controlled cross-test A/B/C/D

Once Steps 1 and 4 are in place, run one small matrix on the Samuel T2 case to
answer whether the no-op is turn-specific or character-specific:

```text
A  Samuel T2 face + T2 audio   (reproduce the failure)
B  Samuel T2 face + T6 audio   (audio that demonstrably worked)
C  Samuel T6 face + T2 audio   (same audio, other preclip window)
D  Samuel T2 face + T2 audio, second provider attempt (sporadic vs deterministic)
```

Each cell writes to immutable paths and is measured with the new statistic.
The result decides whether the follow-up is a provider-side retry policy or an
input-conditioning fix.

## Deliverables

- Immutable, hash-pinned artifact paths for provider outputs and pass preclips.
- A versioned, reproducible calibration fixture plus a guard test against
  artifact drift.
- The new statistic measured and reported on every pass, authoritative only
  after validation.
- Geometry-coupled mouth ROI, persisted per pass.
- A written cross-test result for Samuel T2.

## Technical notes

- Output path is built in `supabase/functions/sync-so-webhook/index.ts`
  (`composer/${uid}/${sceneId}-lipsync-pass-${passIdx + 1}.mp4`).
- Current ROI and measurement live in
  `supabase/functions/_shared/measure-provider-motion-sync.ts`; the pure verdict
  and the invalid fixture in `_shared/motion-probe-classifier.ts`.
- Mouth geometry already exists in `_shared/compute-mouth-centered-crop.ts`
  (`faceShareInCrop`, `mouthOffsetPx`), surfaced through
  `_shared/pass-face-preclip.ts` and persisted in `compose-dialog-segments`.
- Frame extraction stays AWS-only (Remotion Lambda stills), per the existing
  motion-probe contract.
- Evidence base: `docs/v433-motion-studio-rca.md`.

## Not in this gate

- Lowering or re-fitting the existing 15.4 / 3.68 thresholds.
- Changes to provider selection, retry rungs, dispatch or mux.
- Continuity work (`composer_continuity_queue` has no historical rows, S11
  anchor coverage is 8/11 scenes) — tracked separately as its own gate.
