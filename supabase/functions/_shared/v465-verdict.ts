/**
 * V465-B2b — AUTHORITATIVE LIP-SYNC OUTCOME VERDICT (PURE)
 * ---------------------------------------------------------------------------
 * The authoritative scalar of the lip-sync outcome gate is now the PAIRED
 * mouth-over-frame ratio measured on the production Lambda stills:
 *
 *     mouth_over_frame = mean |out(t) - in(t)| inside the mouth ROI
 *                        ---------------------------------------------
 *                        mean |out(t) - in(t)| over the whole still
 *
 * Evidence:
 *   - `docs/v465b1-frozen-verdict-audit.md`  (32 frozen passes, AUC 0.980)
 *   - `docs/v465b2a-lambda-still-parity.md`  (same 32 pairs through the
 *      production Remotion-Lambda still path: r = 0.977, AUC 0.984,
 *      0 FP / 0 FN, all band shifts point towards INDETERMINATE)
 *
 * FROZEN LAMBDA-CALIBRATED CONTRACT (V465-B2b):
 *
 *     mouth_over_frame <  2.00                 -> noop
 *     mouth_over_frame >  2.65                 -> motion
 *     2.00 <= mouth_over_frame <= 2.65         -> indeterminate  (boundaries included)
 *
 * `delta_mean` (v404) and `mad_ratio` (V434) remain LEGACY TELEMETRY. Neither
 * may override, upgrade or downgrade the verdict produced here.
 *
 * SAFETY INVARIANT — a quotient explodes on a vanishing denominator. Whenever
 * the measurement is not trustworthy the verdict is INDETERMINATE, never
 * `motion`:
 *   - missing / insufficient stills
 *   - non-finite mouth or whole-frame measurement
 *   - degenerate ROI (fewer than V465_MIN_ROI_PIXELS pixels)
 *   - whole-frame edit below the documented measurement floor
 *
 * This module is PURE: no IO, no DB, no provider dispatch.
 */

import type { V465PairedMetric } from "./v465-mouth-over-frame.ts";

/** Lambda-calibrated band (V465-B2a recommendation, frozen by B2b). */
export const V465_VERDICT_NOOP_BELOW = 2.0;
export const V465_VERDICT_MOVED_ABOVE = 2.65;

/**
 * Production sampling is N = 6 stills. Below 4 usable paired frames the ratio
 * is a two-sample statistic and is not trusted for a terminal verdict.
 */
export const V465_MIN_FRAMES = 4;

/** A ROI smaller than 8x8 pixels cannot carry a mouth. */
export const V465_MIN_ROI_PIXELS = 64;

/**
 * Measurement floor for the DENOMINATOR (mean |out - in| over the whole still,
 * 0..255 luma scale).
 *
 * Documented derivation (no invented number): on the 32 frozen fixtures the
 * whole-frame edit never came close to zero — the smallest documented values
 * are COH21 2.06, COH22 2.69, COH23 2.95, COH01 3.24, and the global minimum
 * implied by the cohort extremes (smallest NOOP `mouth_edit` 0.61 at
 * `mouth_over_frame` <= 1.4) is ~0.44. Every real re-encoded provider output
 * carries codec noise well above that. 0.40 therefore sits BELOW every observed
 * cohort denominator and only fires on a numerically degenerate measurement
 * (bit-identical or unreadable stills), where the correct answer is "no
 * statement possible".
 */
export const V465_FRAME_EDIT_FLOOR = 0.4;

/**
 * V466-A — gray-band re-measure sampling. A near-boundary ratio on N=6 stills
 * is a sampling question, not a verdict: exactly ONE re-measure of the same
 * immutable pinned output at N=16 stills. Parity-verified on the 32 frozen
 * pairs (0 hard NOOP<->MOVED flips; gray cases resolve towards their true
 * class) — see docs/v465b2a-lambda-still-parity.md.
 */
export const V466_GRAY_BAND_SAMPLES = 16;

export type V465Verdict = "motion" | "noop" | "indeterminate";

export interface V465VerdictResult {
  verdict: V465Verdict;
  reason: string;
  /** The authoritative scalar (null when unmeasurable). */
  mouth_over_frame: number | null;
  mouth_edit: number | null;
  frame_edit: number | null;
  frames: number;
  /** Which safety invariant forced `indeterminate` (null when none did). */
  guard: string | null;
  band: { noop_below: number; moved_above: number };
  authority: "v465_mouth_over_frame";
}

const BAND = {
  noop_below: V465_VERDICT_NOOP_BELOW,
  moved_above: V465_VERDICT_MOVED_ABOVE,
};

function indeterminate(
  guard: string,
  metric?: V465PairedMetric | null,
): V465VerdictResult {
  return {
    verdict: "indeterminate",
    reason: `motion_probe_indeterminate:v465_${guard}`,
    mouth_over_frame: metric?.mouth_over_frame ?? null,
    mouth_edit: metric?.mouth_edit ?? null,
    frame_edit: metric?.frame_edit ?? null,
    frames: metric?.frames ?? 0,
    guard,
    band: BAND,
    authority: "v465_mouth_over_frame",
  };
}

/**
 * PURE — the authoritative V465-B2b verdict.
 *
 * `roiPixels` is the pixel count of the measured mouth box in still space; when
 * omitted the metric's own `roi_pixels` is used. A missing/degenerate ROI is a
 * measurement-quality failure, i.e. INDETERMINATE.
 */
export function resolveV465Verdict(
  metric: V465PairedMetric | null | undefined,
  opts: { roiPixels?: number | null; minFrames?: number } = {},
): V465VerdictResult {
  if (!metric) return indeterminate("metric_missing", null);
  if (metric.classification === "unavailable" || metric.mouth_over_frame == null) {
    return indeterminate(
      `unavailable:${String(metric.reason ?? "unknown").replace(/^v465_unavailable:/, "")}`,
      metric,
    );
  }

  const minFrames = opts.minFrames ?? V465_MIN_FRAMES;
  if (!(metric.frames >= minFrames)) return indeterminate("insufficient_frames", metric);

  const roiPixels = opts.roiPixels ?? metric.roi_pixels ?? null;
  if (roiPixels != null && !(roiPixels >= V465_MIN_ROI_PIXELS)) {
    return indeterminate("degenerate_roi", metric);
  }

  const mouthEdit = metric.mouth_edit;
  const frameEdit = metric.frame_edit;
  const ratio = metric.mouth_over_frame;
  if (
    mouthEdit == null || frameEdit == null ||
    !Number.isFinite(mouthEdit) || !Number.isFinite(frameEdit) || !Number.isFinite(ratio)
  ) {
    return indeterminate("metric_not_finite", metric);
  }
  if (!(frameEdit >= V465_FRAME_EDIT_FLOOR)) {
    return indeterminate("frame_edit_below_floor", metric);
  }

  const base = {
    mouth_over_frame: ratio,
    mouth_edit: mouthEdit,
    frame_edit: frameEdit,
    frames: metric.frames,
    guard: null,
    band: BAND,
    authority: "v465_mouth_over_frame" as const,
  };

  if (ratio < V465_VERDICT_NOOP_BELOW) {
    return {
      ...base,
      verdict: "noop",
      reason: `noop:mouth_over_frame=${ratio}<noop_below=${V465_VERDICT_NOOP_BELOW}`,
    };
  }
  if (ratio > V465_VERDICT_MOVED_ABOVE) {
    return {
      ...base,
      verdict: "motion",
      reason: `motion:mouth_over_frame=${ratio}>moved_above=${V465_VERDICT_MOVED_ABOVE}`,
    };
  }
  return {
    ...base,
    verdict: "indeterminate",
    reason:
      `motion_probe_indeterminate:v465_gray_band mouth_over_frame=${ratio} band=${V465_VERDICT_NOOP_BELOW}..${V465_VERDICT_MOVED_ABOVE}`,
  };
}
