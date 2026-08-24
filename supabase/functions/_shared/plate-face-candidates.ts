/**
 * plate-face-candidates.ts (FA-4 Face-Candidate Fix, Contract A + B)
 *
 * Pure, dependency-free geometry helpers for the plate-face → anchor-slot
 * routing. Extracted so the decision logic is unit-testable without AWS.
 *
 * Contract A — Candidate sanity BEFORE assignment.
 *   Every detected plate face is filtered with the exact production limits
 *   already used by `compose-dialog-segments` (`bboxSanity`):
 *     area_ratio ∈ [0.003, 0.25], aspect ∈ [0.4, 2.5], non-degenerate,
 *     inside the plate with the existing 5% tolerance.
 *   Confidence / identity labels can never skip this filter.
 *
 * Contract B — Global bijective geometry assignment.
 *   Cost is EXCLUSIVELY the euclidean distance of normalized centers.
 *   No identity term, no label tie-break. Identity labels are
 *   non-authoritative diagnostic/supporting evidence only.
 *   Fail-closed exactly on:
 *     a) fewer plausible candidates than anchor slots (countMismatch)
 *     b) no complete bijection
 *     c) exact equal-cost ambiguity, or exactly identical / degenerate
 *        candidate centers
 *   No epsilon, no near-equal band, no new distance cutoff.
 */

export const PLATE_FACE_SANITY = {
  /**
   * V507 — WARN-ONLY. The percentage floor was tuned on close-up plates and
   * scales wrongly with resolution: on a 1920x1080 four-person wide shot
   * 0.003 demands a ~79x79 px face, which legitimately framed medium shots
   * miss. Kept as telemetry so historical measurements stay comparable.
   */
  minAreaRatio: 0.003,
  maxAreaRatio: 0.25,
  minAspect: 0.4,
  maxAspect: 2.5,
  /**
   * V507 — AUTHORITATIVE size gate: shorter face side in plate pixels.
   * Derived from what mouth-ROI tracking actually needs: below ~40 px the
   * mouth region is a handful of pixels and lip-sync cannot be verified.
   * Scale-free (absolute pixels), so it behaves identically on 720p / 1080p
   * plates and does not punish wide multi-speaker framing.
   */
  minFaceShortSidePx: 40,
  /** Fraction of min(plate dim) used as in-plate tolerance (min 8px). */
  inPlateTolPct: 0.05,
} as const;

export type SanityReason =
  | "ok"
  | "degenerate"
  | "out_of_plate"
  | "area_too_small"
  | "face_too_small_for_lipsync"
  | "area_too_large"
  | "aspect_invalid";

/** Reasons that mean "the face itself is too small to lip-sync" (V507). */
export const FACE_SIZE_REJECTIONS: SanityReason[] = ["face_too_small_for_lipsync"];

export interface PlateDims { width: number; height: number }

export interface PlateFaceSanityResult {
  ok: boolean;
  reason: SanityReason;
  areaRatio: number;
  aspect: number;
  /** Shorter side of the bbox in plate pixels (V507 gate input). */
  shortSidePx: number;
  /** Non-blocking observations (e.g. legacy `area_too_small`). */
  warnings: SanityReason[];
}

export function plateFaceSanity(
  bbox: [number, number, number, number],
  dims: PlateDims,
): PlateFaceSanityResult {
  const [x1, y1, x2, y2] = bbox ?? ([0, 0, 0, 0] as any);
  const w = x2 - x1;
  const h = y2 - y1;
  const plateArea = Math.max(1, dims.width * dims.height);
  const areaRatio = (Math.max(0, w) * Math.max(0, h)) / plateArea;
  const aspect = h > 0 ? w / h : 0;
  const shortSidePx = Math.min(Math.max(0, w), Math.max(0, h));
  const warnings: SanityReason[] = [];
  const out = (ok: boolean, reason: SanityReason): PlateFaceSanityResult =>
    ({ ok, reason, areaRatio, aspect, shortSidePx, warnings });

  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return out(false, "degenerate");
  }
  const tol = Math.max(8, Math.round(Math.min(dims.width, dims.height) * PLATE_FACE_SANITY.inPlateTolPct));
  if (x1 < -tol || y1 < -tol || x2 > dims.width + tol || y2 > dims.height + tol) {
    return out(false, "out_of_plate");
  }
  // V507 — percentage floor is telemetry only …
  if (areaRatio < PLATE_FACE_SANITY.minAreaRatio) warnings.push("area_too_small");
  // … the absolute pixel floor is the gate.
  if (shortSidePx < PLATE_FACE_SANITY.minFaceShortSidePx) {
    return out(false, "face_too_small_for_lipsync");
  }
  if (areaRatio > PLATE_FACE_SANITY.maxAreaRatio) {
    return out(false, "area_too_large");
  }
  if (aspect < PLATE_FACE_SANITY.minAspect || aspect > PLATE_FACE_SANITY.maxAspect) {
    return out(false, "aspect_invalid");
  }
  return out(true, "ok");
}

export interface CandidateFace {
  /** Index in the original detection array (stable identity). */
  index: number;
  bbox: [number, number, number, number];
  /** Normalized center on the plate (0..1). */
  cx: number;
  cy: number;
}

export interface CandidateMeasurement {
  index: number;
  reason: SanityReason;
  shortSidePx: number;
  areaRatio: number;
  aspect: number;
}

export function filterPlausibleCandidates<T extends CandidateFace>(
  candidates: T[],
  dims: PlateDims,
): {
  plausible: T[];
  rejected: Array<{ index: number; reason: SanityReason }>;
  /** V507 — per-candidate measurements for telemetry / customer messaging. */
  measurements: CandidateMeasurement[];
} {
  const plausible: T[] = [];
  const rejected: Array<{ index: number; reason: SanityReason }> = [];
  const measurements: CandidateMeasurement[] = [];
  for (const c of candidates) {
    const s = plateFaceSanity(c.bbox, dims);
    measurements.push({
      index: c.index,
      reason: s.reason,
      shortSidePx: Math.round(s.shortSidePx),
      areaRatio: Number(s.areaRatio.toFixed(5)),
      aspect: Number(s.aspect.toFixed(2)),
    });
    if (s.ok) plausible.push(c);
    else rejected.push({ index: c.index, reason: s.reason });
  }
  return { plausible, rejected, measurements };
}


export interface AnchorPoint { cx: number; cy: number }

export type AssignmentFailReason =
  | "count_mismatch"
  | "incomplete_bijection"
  | "equal_cost_ambiguity"
  | "degenerate_candidate_centers";

export interface BijectiveAssignmentResult {
  ok: boolean;
  /** assign[anchorIndex] = candidateArrayIndex (into `candidates`). */
  assign: number[];
  totalCost: number;
  maxDistance: number;
  distances: number[];
  reason?: AssignmentFailReason;
}

/**
 * Global minimum-cost bijection over plausible candidates.
 * Geometry only. Counts exact-cost ties → fail-closed on ambiguity.
 *
 * Exact branch-and-bound over permutations. Column ordering and the
 * admissible lower bound are pure runtime optimizations: they never change
 * which assignment wins, never introduce an epsilon and never add a
 * business threshold. There is deliberately NO input-size gate — the solver
 * must handle the productive maximum cast.
 */
export function assignAnchorsToCandidatesBijective(
  anchors: AnchorPoint[],
  candidates: Array<{ cx: number; cy: number }>,
): BijectiveAssignmentResult {
  const rows = anchors.length;
  const cols = candidates.length;
  const empty = (reason: AssignmentFailReason): BijectiveAssignmentResult => ({
    ok: false, assign: [], totalCost: 0, maxDistance: 0, distances: [], reason,
  });
  if (rows === 0) return empty("count_mismatch");
  if (cols < rows) return empty("count_mismatch");

  // Exactly identical / degenerate candidate centers → fail-closed (B.1c).
  for (let i = 0; i < cols; i++) {
    const a = candidates[i];
    if (!Number.isFinite(a.cx) || !Number.isFinite(a.cy)) return empty("degenerate_candidate_centers");
    for (let j = i + 1; j < cols; j++) {
      const b = candidates[j];
      if (a.cx === b.cx && a.cy === b.cy) return empty("degenerate_candidate_centers");
    }
  }

  const cost: number[][] = anchors.map((a) =>
    candidates.map((p) => Math.sqrt((a.cx - p.cx) ** 2 + (a.cy - p.cy) ** 2))
  );

  // Per-row visit order (cheapest column first) — finds a strong incumbent
  // early so the admissible bound prunes hard. Result-neutral.
  const order: number[][] = cost.map((row) => {
    const idx = row.map((_, c) => c);
    idx.sort((c1, c2) => (row[c1] - row[c2]) || (c1 - c2));
    return idx;
  });

  // Admissible lower bound for the remaining rows: sum of per-row minima,
  // ignoring the bijection constraint. Never overestimates → exact.
  const rowMin = cost.map((row) => row.reduce((m, v) => (v < m ? v : m), Infinity));
  const suffixMin = new Array(rows + 1).fill(0);
  for (let r = rows - 1; r >= 0; r--) suffixMin[r] = suffixMin[r + 1] + rowMin[r];

  const used = new Array(cols).fill(false);
  const pick = new Array(rows).fill(-1);
  let best: number[] | null = null;
  let bestScore = Infinity;
  let bestCount = 0;
  const dfs = (r: number, sum: number) => {
    if (r === rows) {
      if (sum < bestScore) { bestScore = sum; best = pick.slice(); bestCount = 1; }
      else if (sum === bestScore) { bestCount++; }
      return;
    }
    // Prune strictly-worse branches only — equal-cost branches must still be
    // enumerated so exact tie detection stays intact.
    if (sum + suffixMin[r] > bestScore) return;
    const colsForRow = order[r];
    for (let k = 0; k < colsForRow.length; k++) {
      const c = colsForRow[k];
      if (used[c]) continue;
      used[c] = true;
      pick[r] = c;
      dfs(r + 1, sum + cost[r][c]);
      used[c] = false;
      pick[r] = -1;
    }
  };
  dfs(0, 0);

  if (!best || (best as number[]).some((c) => c < 0)) return empty("incomplete_bijection");
  if (bestCount > 1) return empty("equal_cost_ambiguity");

  const assign = best as number[];
  const distances = assign.map((c, r) => cost[r][c]);
  return {
    ok: true,
    assign,
    totalCost: bestScore,
    maxDistance: distances.reduce((m, d) => (d > m ? d : m), 0),
    distances,
  };
}

// ── FA-4 P0 — Router failure classification ──────────────────────────
//
// Contract-B (geometry) failures are integration-level FAIL-CLOSED: the
// legacy `resolvePlateFaceIdentities()` route must never take over after a
// confirmed geometry decision. Infrastructure failures keep the existing
// legacy recovery contract.
//
// The classifier takes STRUCTURED input on purpose: `no_faces_detected`
// alone is ambiguous — only a *successful* detection that returned zero
// candidates while anchor slots exist is a contractual failure.

export type RouterFailureClass = "contractual" | "infrastructure";

export interface RouterFailureInput {
  /** Raw router reason (may carry the `fa4_fail_closed:` prefix). */
  reason?: string | null;
  /** True when the DetectFaces call itself completed without error. */
  detectSucceeded: boolean;
  /** Faces returned by the detector (before sanity filtering). */
  detectedCount: number;
  /** Anchor slots expected by the layout. */
  expectedCount: number;
  /** True when the router threw instead of returning a result. */
  threw?: boolean;
}

const CONTRACTUAL_GEOMETRY_REASONS: string[] = [
  "count_mismatch",
  "incomplete_bijection",
  "equal_cost_ambiguity",
  "degenerate_candidate_centers",
  // V507 — "faces too small for lip-sync" is a confirmed measurement of the
  // plate, not an infrastructure hiccup → fail closed, no legacy fallback.
  "faces_too_small_for_lipsync",
];


export function classifyRouterFailure(input: RouterFailureInput): RouterFailureClass {
  if (input.threw) return "infrastructure";
  const reason = String(input.reason ?? "");
  const bare = reason.startsWith("fa4_fail_closed:")
    ? reason.slice("fa4_fail_closed:".length).split(":")[0]
    : reason.split(":")[0];
  if (CONTRACTUAL_GEOMETRY_REASONS.includes(bare)) {
    return "contractual";
  }
  if (bare === "no_faces_detected") {
    // Successful detection with zero plate faces while anchors exist is a
    // confirmed geometry statement → fail-closed. Anything else (no anchor
    // slots, detector never ran) stays recoverable.
    return input.detectSucceeded && input.expectedCount > 0 && input.detectedCount === 0
      ? "contractual"
      : "infrastructure";
  }
  // aws_credentials_missing, plate_fetch_failed, detect_failed:*, empty_input …
  return "infrastructure";
}

