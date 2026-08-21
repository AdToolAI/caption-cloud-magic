/**
 * V434 STEP 2 — REPRODUCIBLE CALIBRATION INFRASTRUCTURE
 * ---------------------------------------------------------------------------
 * The v404 calibration is RETIRED as ground truth. `docs/v433-motion-studio-rca.md`
 * proved it circular: its samples pointed at MUTABLE storage keys that later
 * runs overwrote, so the labelled "no-op" samples now re-measure as motion
 * (169.5 / 73.6) while the real Samuel T2 no-op measured +42.8. Thresholds
 * fitted on that set cannot separate anything.
 *
 * Ground truth is rebuilt from IMMUTABLE, sha256-pinned samples only
 * (see `v434-immutable-artifact.ts`). This module is PURE: it validates a
 * manifest and derives candidate thresholds. It never promotes anything — a
 * derived threshold becomes authoritative only by an explicit, separate gate.
 */

export const V434_MANIFEST_VERSION = 1 as const;
export const V434_MIN_SAMPLES_PER_CLASS = 3;

export type V434SampleLabel = "noop" | "motion";

/** Why a historical sample cannot serve as ground truth. */
export type V434SampleStatus =
  /** Immutable, sha-pinned, re-measurable → usable. */
  | "reproducible"
  /** Recorded before immutable paths existed; bytes may have been overwritten. */
  | "legacy_non_reproducible"
  /** Pinned but not yet re-measured. */
  | "pending_measurement";

export interface V434CalibrationSample {
  id: string;
  label: V434SampleLabel;
  status: V434SampleStatus;
  scene_id: string | null;
  run_id: string | null;
  generation: number | null;
  pass_idx: number | null;
  preclip: { key: string | null; sha256: string | null };
  provider: { key: string | null; sha256: string | null };
  /** Scale-free metric — the only candidate for the rebuilt gate. */
  mad_ratio: number | null;
  /** Retired v404 scalar, kept for differential comparison only. */
  legacy_delta_mean: number | null;
  note?: string;
}

export interface V434CalibrationManifest {
  version: number;
  created_at: string;
  metric: string;
  /** Human-readable statement of what this manifest may and may not decide. */
  authority: "telemetry_only" | "authoritative";
  samples: V434CalibrationSample[];
}

export interface ManifestValidation {
  ok: boolean;
  errors: string[];
  reproducible: number;
  legacy: number;
  pending: number;
}

/** PURE. Structural + integrity validation of a manifest. */
export function validateManifest(manifest: unknown): ManifestValidation {
  const errors: string[] = [];
  const m = manifest as V434CalibrationManifest;
  if (!m || typeof m !== "object") {
    return { ok: false, errors: ["manifest_not_an_object"], reproducible: 0, legacy: 0, pending: 0 };
  }
  if (m.version !== V434_MANIFEST_VERSION) errors.push(`unsupported_version:${m.version}`);
  if (!Array.isArray(m.samples)) {
    return { ok: false, errors: [...errors, "samples_missing"], reproducible: 0, legacy: 0, pending: 0 };
  }
  const seen = new Set<string>();
  let reproducible = 0;
  let legacy = 0;
  let pending = 0;
  for (const s of m.samples) {
    if (!s?.id) errors.push("sample_without_id");
    else if (seen.has(s.id)) errors.push(`duplicate_sample_id:${s.id}`);
    else seen.add(s.id);
    if (s?.label !== "noop" && s?.label !== "motion") errors.push(`invalid_label:${s?.id}`);
    if (s?.status === "reproducible") {
      reproducible++;
      // A reproducible sample MUST be verifiable: immutable keys + hashes.
      if (!s.preclip?.key || !s.preclip?.sha256) errors.push(`unpinned_preclip:${s.id}`);
      if (!s.provider?.key || !s.provider?.sha256) errors.push(`unpinned_provider:${s.id}`);
      if (!s.run_id) errors.push(`missing_run_id:${s.id}`);
      if (!Number.isFinite(Number(s.mad_ratio))) errors.push(`missing_mad_ratio:${s.id}`);
    } else if (s?.status === "legacy_non_reproducible") legacy++;
    else if (s?.status === "pending_measurement") pending++;
    else errors.push(`invalid_status:${s?.id}`);
  }
  return { ok: errors.length === 0, errors, reproducible, legacy, pending };
}

export interface ThresholdDerivation {
  status: "derived" | "insufficient_samples" | "not_separable" | "invalid_manifest";
  reason: string;
  metric: string;
  noop_max: number | null;
  motion_min: number | null;
  gap: number | null;
  threshold: number | null;
  counts: { noop: number; motion: number };
}

/**
 * PURE. Derives a candidate MAD-ratio threshold from REPRODUCIBLE samples only.
 *
 * Guard rails that the v404 calibration lacked:
 *   - legacy/non-reproducible samples are excluded outright,
 *   - a minimum sample count per class is required,
 *   - the classes must be strictly separable; overlap yields NO threshold
 *     instead of a fitted number.
 */
export function deriveMadRatioThreshold(manifest: unknown): ThresholdDerivation {
  const base: ThresholdDerivation = {
    status: "insufficient_samples",
    reason: "",
    metric: "mad_ratio",
    noop_max: null,
    motion_min: null,
    gap: null,
    threshold: null,
    counts: { noop: 0, motion: 0 },
  };
  const validation = validateManifest(manifest);
  if (!validation.ok) {
    return { ...base, status: "invalid_manifest", reason: validation.errors.join(",") };
  }
  const m = manifest as V434CalibrationManifest;
  const usable = m.samples.filter((s) =>
    s.status === "reproducible" && Number.isFinite(Number(s.mad_ratio))
  );
  const noop = usable.filter((s) => s.label === "noop").map((s) => Number(s.mad_ratio));
  const motion = usable.filter((s) => s.label === "motion").map((s) => Number(s.mad_ratio));
  const counts = { noop: noop.length, motion: motion.length };
  if (noop.length < V434_MIN_SAMPLES_PER_CLASS || motion.length < V434_MIN_SAMPLES_PER_CLASS) {
    return {
      ...base,
      counts,
      reason:
        `need >= ${V434_MIN_SAMPLES_PER_CLASS} reproducible samples per class (noop=${noop.length}, motion=${motion.length})`,
    };
  }
  const noopMax = Math.max(...noop);
  const motionMin = Math.min(...motion);
  if (!(motionMin > noopMax)) {
    return {
      ...base,
      counts,
      status: "not_separable",
      reason: `classes overlap: noop_max=${noopMax} >= motion_min=${motionMin}`,
      noop_max: noopMax,
      motion_min: motionMin,
      gap: motionMin - noopMax,
    };
  }
  return {
    status: "derived",
    reason: "candidate threshold — telemetry only until separately promoted",
    metric: "mad_ratio",
    noop_max: noopMax,
    motion_min: motionMin,
    gap: motionMin - noopMax,
    threshold: noopMax + (motionMin - noopMax) / 2,
    counts,
  };
}
