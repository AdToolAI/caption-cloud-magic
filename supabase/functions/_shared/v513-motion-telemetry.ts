// ─────────────────────────────────────────────────────────────────────────────
// V513-T0 — SHADOW MOTION TELEMETRY (observation only)
//
// Contract (audited):
//   • Track box semantics are [x1, y1, x2, y2].
//   • center = [(x1+x2)/2, (y1+y2)/2]
//   • face side = max(x2-x1, y2-y1)
//   • ALL normalized translation features are normalized by the MEDIAN FACE
//     SIDE — never by plate width/height/short side. The helper therefore does
//     not receive and must not depend on plate dimensions.
//   • Minimum usable sample count = 3.
//   • No score, no moving boolean, no thresholds, no gates, no consumers.
//   • `reason` is capped at 200 characters; every numeric field is a finite,
//     JSON-safe value. The function never throws.
// ─────────────────────────────────────────────────────────────────────────────

export type V513TelemetryStatus =
  | "ok"
  | "no_plate_box"
  | "track_failed"
  | "insufficient_samples";

export interface V513MotionTelemetry {
  version: 513;
  status: V513TelemetryStatus;
  reason: string | null;
  sample_count: number;
  median_side_px: number;
  center_x_range_norm: number;
  center_y_range_norm: number;
  center_range_norm: number;
  net_displacement_norm: number;
  path_length_norm: number;
  max_step_norm: number;
  mean_step_norm: number;
  side_range_norm: number;
  side_change_pct: number;
  heading_changes_gt_90: number;
  max_heading_change_deg: number;
  second_difference_norm_diagnostic: number;
}

export interface V513Input {
  /** v477 track samples, or null when there was no plate box at all. */
  samples: unknown[] | null | undefined;
  /** true/false from the v477 track; undefined when the track never ran. */
  trackOk: boolean | undefined;
  /** Track reason, or the `track_threw:` marker. */
  reason: string | null | undefined;
}

const REASON_MAX = 200;
const MIN_SAMPLES = 3;

function cap(reason: unknown): string | null {
  if (reason === null || reason === undefined) return null;
  const s = (typeof reason === "string" ? reason : String(reason)).trim();
  if (!s) return null;
  return s.length > REASON_MAX ? s.slice(0, REASON_MAX) : s;
}

/** Coerce to a finite, JSON-safe number rounded to 4 decimals. */
function fin(value: unknown, fallback = 0): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Number(n.toFixed(4));
}

function empty(status: V513TelemetryStatus, reason: unknown): V513MotionTelemetry {
  return {
    version: 513,
    status,
    reason: cap(reason),
    sample_count: 0,
    median_side_px: 0,
    center_x_range_norm: 0,
    center_y_range_norm: 0,
    center_range_norm: 0,
    net_displacement_norm: 0,
    path_length_norm: 0,
    max_step_norm: 0,
    mean_step_norm: 0,
    side_range_norm: 0,
    side_change_pct: 0,
    heading_changes_gt_90: 0,
    max_heading_change_deg: 0,
    second_difference_norm_diagnostic: 0,
  };
}

type Box = [number, number, number, number];

/** Parse [x1, y1, x2, y2]; rejects degenerate or non-finite boxes. */
function asBox(value: unknown): Box | null {
  if (!Array.isArray(value) || value.length < 4) return null;
  const b = value.slice(0, 4).map((v) => Number(v));
  if (!b.every((v) => Number.isFinite(v))) return null;
  if (!(b[2] > b[0]) || !(b[3] > b[1])) return null;
  return b as Box;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function computeV513MotionTelemetry(input: V513Input): V513MotionTelemetry {
  try {
    if (input.samples === null || input.samples === undefined) {
      return empty("no_plate_box", input.reason ?? "no_plate_box");
    }
    if (input.trackOk !== true) {
      return empty("track_failed", input.reason ?? "track_unavailable");
    }

    const raw = Array.isArray(input.samples) ? input.samples : [];
    const parsed: Array<{ t: number; box: Box }> = [];
    for (const s of raw) {
      const rec = s as Record<string, unknown> | null;
      if (!rec) continue;
      const box = asBox(rec.box);
      if (!box) continue;
      const t = Number(rec.t);
      parsed.push({ t: Number.isFinite(t) ? t : parsed.length, box });
    }
    parsed.sort((a, b) => a.t - b.t);

    if (parsed.length < MIN_SAMPLES) {
      const out = empty("insufficient_samples", `usable_samples=${parsed.length}`);
      out.sample_count = fin(parsed.length);
      return out;
    }

    const centers = parsed.map(
      (p) =>
        [(p.box[0] + p.box[2]) / 2, (p.box[1] + p.box[3]) / 2] as [number, number],
    );
    const sides = parsed.map((p) => Math.max(p.box[2] - p.box[0], p.box[3] - p.box[1]));

    const medianSide = median(sides);
    if (!(medianSide > 0)) {
      const out = empty("insufficient_samples", "median_side_invalid");
      out.sample_count = fin(parsed.length);
      return out;
    }

    const xs = centers.map((c) => c[0]);
    const ys = centers.map((c) => c[1]);
    const xRange = (Math.max(...xs) - Math.min(...xs)) / medianSide;
    const yRange = (Math.max(...ys) - Math.min(...ys)) / medianSide;

    const first = centers[0];
    const last = centers[centers.length - 1];
    const netDisplacement = Math.hypot(last[0] - first[0], last[1] - first[1]) / medianSide;

    let pathLength = 0;
    let maxStep = 0;
    const steps: Array<[number, number]> = [];
    for (let i = 1; i < centers.length; i++) {
      const dx = centers[i][0] - centers[i - 1][0];
      const dy = centers[i][1] - centers[i - 1][1];
      steps.push([dx, dy]);
      const d = Math.hypot(dx, dy) / medianSide;
      pathLength += d;
      if (d > maxStep) maxStep = d;
    }
    const meanStep = steps.length ? pathLength / steps.length : 0;

    let headingChangesGt90 = 0;
    let maxHeadingChange = 0;
    for (let i = 1; i < steps.length; i++) {
      const [ax, ay] = steps[i - 1];
      const [bx, by] = steps[i];
      const na = Math.hypot(ax, ay);
      const nb = Math.hypot(bx, by);
      if (na === 0 || nb === 0) continue;
      const cos = Math.min(1, Math.max(-1, (ax * bx + ay * by) / (na * nb)));
      const deg = (Math.acos(cos) * 180) / Math.PI;
      if (deg > 90) headingChangesGt90 += 1;
      if (deg > maxHeadingChange) maxHeadingChange = deg;
    }

    let secondDiffSum = 0;
    let secondDiffCount = 0;
    for (let i = 1; i < centers.length - 1; i++) {
      const dx = centers[i + 1][0] - 2 * centers[i][0] + centers[i - 1][0];
      const dy = centers[i + 1][1] - 2 * centers[i][1] + centers[i - 1][1];
      secondDiffSum += Math.hypot(dx, dy) / medianSide;
      secondDiffCount += 1;
    }
    const secondDiff = secondDiffCount ? secondDiffSum / secondDiffCount : 0;

    const minSide = Math.min(...sides);
    const maxSide = Math.max(...sides);
    const sideRange = (maxSide - minSide) / medianSide;

    return {
      version: 513,
      status: "ok",
      reason: cap(input.reason),
      sample_count: fin(parsed.length),
      median_side_px: fin(medianSide),
      center_x_range_norm: fin(xRange),
      center_y_range_norm: fin(yRange),
      center_range_norm: fin(Math.hypot(xRange, yRange)),
      net_displacement_norm: fin(netDisplacement),
      path_length_norm: fin(pathLength),
      max_step_norm: fin(maxStep),
      mean_step_norm: fin(meanStep),
      side_range_norm: fin(sideRange),
      side_change_pct: fin(sideRange * 100),
      heading_changes_gt_90: fin(headingChangesGt90),
      max_heading_change_deg: fin(maxHeadingChange),
      second_difference_norm_diagnostic: fin(secondDiff),
    };
  } catch (err) {
    return empty("track_failed", err instanceof Error ? err.message : String(err));
  }
}
