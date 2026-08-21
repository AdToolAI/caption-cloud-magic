/**
 * V434 STEP 3 — SCALE-FREE OUTCOME METRIC (TELEMETRY ONLY, NOT AUTHORITATIVE)
 * ---------------------------------------------------------------------------
 * `docs/v433-motion-studio-rca.md` established that the v404 absolute
 * `deltaMean` scalar cannot separate a provider no-op from real lip motion:
 * the Samuel T2 no-op measured +42.8 while genuine motion samples reproduce at
 * 169.5 / 73.6 — but the SAME no-op is separated cleanly by a scale-free
 * ratio of consecutive-frame mean-absolute-difference (MAD):
 *   no-op MADratio 1.30  vs  lowest observed motion 1.68.
 *
 * MADratio = MAD(provider output) / MAD(provider input pre-clip)
 * It is dimensionless: brightness, contrast, codec and crop scale cancel out,
 * which is exactly what the absolute variance delta failed to do.
 *
 * ⚠️ STATUS: TELEMETRY ONLY. This module deliberately exposes NO production
 * threshold and NO pass/fail verdict. The authoritative outcome gate remains
 * `classifyMotionProbe()` until a reproducible calibration manifest
 * (V434 Step 2) has been built from IMMUTABLE samples and separately promoted.
 */

export const V434_MAD_STATUS = "telemetry_only" as const;
export const V434_MAD_METHOD = "consecutive-frame-mad-ratio-v434" as const;

export interface MadFrame {
  width: number;
  height: number;
  /** RGBA bytes. */
  data: Uint8Array | Uint8ClampedArray | number[];
}

export interface MadRoi {
  bx: number;
  by: number;
  bw: number;
  bh: number;
}

export interface MadSummary {
  /** Per-consecutive-pair MAD values, in frame order. Length = frames - 1. */
  series: number[];
  mean: number;
  median: number;
  max: number;
  min: number;
  frames: number;
  method: string;
}

/** PURE. Rec.601 luma plane of the ROI. */
export function roiLuma(frame: MadFrame, roi: MadRoi): Float64Array {
  const { bx, by, bw, bh } = roi;
  const out = new Float64Array(bw * bh);
  let k = 0;
  for (let y = by; y < by + bh; y++) {
    for (let x = bx; x < bx + bw; x++) {
      const off = (y * frame.width + x) * 4;
      out[k++] = 0.299 * frame.data[off] + 0.587 * frame.data[off + 1] + 0.114 * frame.data[off + 2];
    }
  }
  return out;
}

/** PURE. Median of a numeric series (empty → 0). */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * PURE. Mean absolute difference between each consecutive frame pair, inside
 * the ROI. Requires >= 2 frames; fewer returns an all-zero summary.
 */
export function computeMadSummary(frames: MadFrame[], roi: MadRoi): MadSummary {
  const empty: MadSummary = {
    series: [],
    mean: 0,
    median: 0,
    max: 0,
    min: 0,
    frames: frames.length,
    method: V434_MAD_METHOD,
  };
  if (frames.length < 2 || roi.bw <= 0 || roi.bh <= 0) return empty;

  const px = roi.bw * roi.bh;
  const planes = frames.map((f) => roiLuma(f, roi));
  const series: number[] = [];
  for (let i = 1; i < planes.length; i++) {
    const a = planes[i - 1];
    const b = planes[i];
    let sum = 0;
    for (let p = 0; p < px; p++) sum += Math.abs(b[p] - a[p]);
    series.push(sum / px);
  }
  return {
    series,
    mean: series.reduce((s, v) => s + v, 0) / series.length,
    median: median(series),
    max: Math.max(...series),
    min: Math.min(...series),
    frames: frames.length,
    method: V434_MAD_METHOD,
  };
}

export interface MadRatioTelemetry {
  status: typeof V434_MAD_STATUS;
  method: string;
  /** provider MAD mean / preclip MAD mean — null when not computable. */
  mad_ratio: number | null;
  mad_ratio_median: number | null;
  preclip_mad_mean: number | null;
  provider_mad_mean: number | null;
  reason: string;
}

/**
 * PURE. Builds the scale-free telemetry record. Returns `mad_ratio: null`
 * (never a fabricated number) when either side is missing or the preclip MAD
 * is degenerate — an unknown ratio is reported as unknown, never as 0.
 */
export function buildMadRatioTelemetry(
  preclip: MadSummary | null | undefined,
  provider: MadSummary | null | undefined,
): MadRatioTelemetry {
  const base: MadRatioTelemetry = {
    status: V434_MAD_STATUS,
    method: V434_MAD_METHOD,
    mad_ratio: null,
    mad_ratio_median: null,
    preclip_mad_mean: preclip?.mean ?? null,
    provider_mad_mean: provider?.mean ?? null,
    reason: "mad_ratio_unavailable",
  };
  if (!preclip || !provider) return base;
  if (!Number.isFinite(preclip.mean) || !Number.isFinite(provider.mean)) return base;
  if (preclip.mean <= 1e-6) return { ...base, reason: "mad_ratio_unavailable:preclip_mad_degenerate" };
  const ratio = provider.mean / preclip.mean;
  const ratioMedian = preclip.median > 1e-6 ? provider.median / preclip.median : null;
  if (!Number.isFinite(ratio)) return base;
  return {
    ...base,
    mad_ratio: ratio,
    mad_ratio_median: ratioMedian !== null && Number.isFinite(ratioMedian) ? ratioMedian : null,
    reason: "mad_ratio_measured",
  };
}
