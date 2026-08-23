/**
 * V465-B2a — PAIRED MOUTH-OVER-FRAME METRIC (TELEMETRY ONLY)
 * ---------------------------------------------------------------------------
 * Audit evidence: `docs/v465b1-frozen-verdict-audit.md`.
 *
 * The frozen v404 verdict metric compares the SELF-motion of two clips
 * (`provider.mean - preclip.mean`). On moving plates that question is simply
 * the wrong one: 11 of 18 proven MOVED passes score negative or sub-threshold
 * (COH06 = -169.6). The V434 MAD ratio overlaps just as badly (10 FN).
 *
 * The question that separates on the frozen cohort (AUC 0.980, LOSO 1 FP /
 * 1 FN) is PAIRED:
 *
 *     mouth_over_frame = mean |out(t) - in(t)| inside the mouth ROI
 *                        ---------------------------------------------
 *                        mean |out(t) - in(t)| over the whole still
 *
 * i.e. "is the change in the mouth disproportionate to the change of the whole
 * frame?" — scale free, plate-motion free, re-encode free.
 *
 * This module is PURE. It is telemetry until V465-B2b flips the authority;
 * nothing here may terminalize a pass, trigger a refund or start a retry.
 */

/** Frozen conservative band from V465-B1 (0 FP / 0 FN on 32 frozen passes). */
export const V465_NOOP_BELOW = 2.0;
export const V465_MOVED_ABOVE = 3.1;

export type V465Classification = "noop" | "indeterminate" | "moved" | "unavailable";

export interface DecodedStill {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray | number[];
}

export interface RoiBox {
  bx: number;
  by: number;
  bw: number;
  bh: number;
}

export interface V465PairedMetric {
  mouth_edit: number | null;
  frame_edit: number | null;
  mouth_over_frame: number | null;
  classification: V465Classification;
  frames: number;
  reason: string;
  band: { noop_below: number; moved_above: number };
}

const EPS = 1e-6;

/** PURE — Rec.601 luma of one pixel offset. */
function luma(img: DecodedStill, off: number): number {
  return 0.299 * (img.data[off] as number) +
    0.587 * (img.data[off + 1] as number) +
    0.114 * (img.data[off + 2] as number);
}

/** PURE — mean |a - b| over a box, both stills sampled at the same timestamp. */
export function meanAbsDiff(a: DecodedStill[], b: DecodedStill[], roi: RoiBox): number {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const fa = a[i];
    const fb = b[i];
    for (let y = roi.by; y < roi.by + roi.bh; y++) {
      for (let x = roi.bx; x < roi.bx + roi.bw; x++) {
        sum += Math.abs(luma(fa, (y * fa.width + x) * 4) - luma(fb, (y * fb.width + x) * 4));
        count++;
      }
    }
  }
  return count > 0 ? sum / count : NaN;
}

/** PURE — conservative three-way band. Never collapses INDETERMINATE to MOVED. */
export function classifyMouthOverFrame(
  ratio: number | null | undefined,
  band: { noopBelow?: number; movedAbove?: number } = {},
): V465Classification {
  const noopBelow = band.noopBelow ?? V465_NOOP_BELOW;
  const movedAbove = band.movedAbove ?? V465_MOVED_ABOVE;
  if (ratio == null || !Number.isFinite(ratio)) return "unavailable";
  if (ratio < noopBelow) return "noop";
  if (ratio > movedAbove) return "moved";
  return "indeterminate";
}

const UNAVAILABLE = (reason: string): V465PairedMetric => ({
  mouth_edit: null,
  frame_edit: null,
  mouth_over_frame: null,
  classification: "unavailable",
  frames: 0,
  reason,
  band: { noop_below: V465_NOOP_BELOW, moved_above: V465_MOVED_ABOVE },
});

/**
 * PURE — the paired metric on the SAME already-decoded production stills.
 * Zero extra Lambda invokes, zero extra downloads.
 *
 * `preclipRoi` / `providerRoi` are the per-asset mouth boxes in still space.
 * They must be congruent (same size); otherwise the pair is not comparable and
 * the metric reports `unavailable` instead of guessing.
 */
export function computeMouthOverFrame(args: {
  preclipStills: DecodedStill[];
  providerStills: DecodedStill[];
  preclipRoi: RoiBox;
  providerRoi: RoiBox;
}): V465PairedMetric {
  const { preclipStills: A, providerStills: B, preclipRoi, providerRoi } = args;
  if (!A?.length || !B?.length) return UNAVAILABLE("v465_unavailable:no_stills");
  if (A.length !== B.length) return UNAVAILABLE("v465_unavailable:frame_count_mismatch");
  if (A[0].width !== B[0].width || A[0].height !== B[0].height) {
    return UNAVAILABLE("v465_unavailable:still_dimension_mismatch");
  }
  if (preclipRoi.bw !== providerRoi.bw || preclipRoi.bh !== providerRoi.bh) {
    return UNAVAILABLE("v465_unavailable:roi_incongruent");
  }
  if (preclipRoi.bx !== providerRoi.bx || preclipRoi.by !== providerRoi.by) {
    return UNAVAILABLE("v465_unavailable:roi_offset_mismatch");
  }
  const full: RoiBox = { bx: 0, by: 0, bw: A[0].width, bh: A[0].height };
  const mouthEdit = meanAbsDiff(A, B, preclipRoi);
  const frameEdit = meanAbsDiff(A, B, full);
  if (!Number.isFinite(mouthEdit) || !Number.isFinite(frameEdit)) {
    return UNAVAILABLE("v465_unavailable:metric_not_finite");
  }
  const ratio = mouthEdit / (frameEdit + EPS);
  return {
    mouth_edit: mouthEdit,
    frame_edit: frameEdit,
    mouth_over_frame: ratio,
    classification: classifyMouthOverFrame(ratio),
    frames: A.length,
    reason: "measured",
    band: { noop_below: V465_NOOP_BELOW, moved_above: V465_MOVED_ABOVE },
  };
}
