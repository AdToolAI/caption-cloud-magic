/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE V434 MOUTH-CROP CONTRACT — ONE AUTHORITY FOR PLANNER AND VERIFIER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Acceptance test N1-02 ("Dreiviertel mit Bewegung", single speaker, dynamic
 * camera path) died pre-dispatch on `preclip_mouth_roi_outside_crop` with a
 * worst margin of −0.006498255 — the mouth band overhanging the rendered crop
 * by 0.65 % of its width. Face share (0.365 vs floor 0.24) and provider face
 * size (466.98 px vs floor 144) were both healthy. No threshold was involved.
 *
 * The cause was a producer/consumer contract split. `buildDynamicCameraPath`
 * solved the crop centre from the FACE box alone:
 *
 *     loX = b[2] + pad − half     hiX = b[0] − pad + half
 *
 * then wrote the per-frame mouth `mx/my` onto the keyframe as a passenger. It
 * never constrained the crop by it. V461 then read exactly those `mx/my`, put
 * the full unclamped V434 band around them, and required the band to fit. The
 * planner's satisfaction set was a strict superset of the gate's acceptance
 * set, so every solution in the difference was a guaranteed pre-dispatch
 * failure — produced by the planner, using data the planner itself had
 * written.
 *
 * This module removes the split by construction rather than by tolerance. It
 * owns:
 *
 *   1. the V434 band derivation, re-exported so nobody derives it twice;
 *   2. the unclamped containment predicate and its signed margin;
 *   3. the feasible crop-centre INTERVAL for face + mouth + plate.
 *
 * V461 keeps its own acceptance semantics unchanged — `margin >= 0`, no
 * epsilon, no clamping. It simply stops carrying a private copy of the band.
 *
 * WHAT IS DELIBERATELY NOT HERE
 * -----------------------------
 * V522 Contract E.3 (sibling exclusion) is NOT a crop-position constraint and
 * is not modelled. E.3 asks whether another speaker's centre lies inside the
 * target's box AFTER both are projected through the SAME crop transform
 * (`v464-asd-projection.ts:525` pairs `built.boxes[i]` with
 * `built.frameOtherCenters[i]`). With the crop size frozen, translating the
 * crop shifts box and centre by the identical vector, so membership is
 * translation-invariant. Intersecting it into a centre interval would be
 * modelling a constraint that does not depend on the variable being solved.
 */

import { V434_MOUTH_BAND } from "./v434-motion-roi.ts";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * PURE — the mouth band size from face share.
 *
 * Byte-for-byte the derivation V461 carried privately, moved here so the
 * planner and the gate cannot drift apart. Constants stay in
 * `v434-motion-roi.ts`; this module never redefines them.
 */
export function v434MouthBand(faceShare: number): { width: number; height: number } {
  const faceSideFrac = clamp(Math.sqrt(faceShare), 0.05, 1);
  return {
    width: clamp(
      V434_MOUTH_BAND.widthOfFaceSide * faceSideFrac,
      V434_MOUTH_BAND.minWidth,
      V434_MOUTH_BAND.maxWidth,
    ),
    height: clamp(
      V434_MOUTH_BAND.heightOfFaceSide * faceSideFrac,
      V434_MOUTH_BAND.minHeight,
      V434_MOUTH_BAND.maxHeight,
    ),
  };
}

export interface NormalizedRoi {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

/**
 * PURE — signed containment margin of a normalized ROI, in crop fractions.
 *
 * Negative means the band escapes. UNCLAMPED on purpose: a clamped centre
 * cannot express an escape, which is exactly how the camera path's own
 * telemetry (`mouthRoiSamples`, clamped to [0,1] with a 0.28 band) reported
 * N1-02 as unremarkable while the gate measured 1.0065.
 */
export function roiContainmentMargin(roi: NormalizedRoi): number {
  return Math.min(
    roi.centerX - roi.width / 2,
    1 - (roi.centerX + roi.width / 2),
    roi.centerY - roi.height / 2,
    1 - (roi.centerY + roi.height / 2),
  );
}

/** PURE — the gate predicate. Boundary-inclusive, no tolerance. */
export function roiFullyInside(roi: NormalizedRoi): boolean {
  return roi.centerX - roi.width / 2 >= 0 &&
    roi.centerX + roi.width / 2 <= 1 &&
    roi.centerY - roi.height / 2 >= 0 &&
    roi.centerY + roi.height / 2 <= 1;
}

/**
 * PURE — the unclamped mouth band inside one crop window, in crop fractions.
 *
 * `mouth` and `crop` must both be in PLATE pixels. This is the single
 * projection both the planner and the gate use.
 */
export function mouthRoiInCrop(
  faceShare: number,
  mouth: { x: number; y: number },
  crop: { x: number; y: number; size: number },
): NormalizedRoi {
  const { width, height } = v434MouthBand(faceShare);
  return {
    centerX: (mouth.x - crop.x) / crop.size,
    centerY: (mouth.y - crop.y) / crop.size,
    width,
    height,
  };
}

// ── FEASIBLE CROP-CENTRE INTERVAL ──────────────────────────────────────────

/** A closed interval on one axis. Empty when `lo > hi`. */
export interface Interval {
  lo: number;
  hi: number;
}

export type FeasibilityAxis = "x" | "y";

export interface CropCentreFeasibility {
  ok: boolean;
  x: Interval;
  y: Interval;
  /** The first axis whose intersection is empty, when `ok` is false. */
  emptyAxis: FeasibilityAxis | null;
  /** Whether a trustworthy mouth actually participated. */
  mouthConstrained: boolean;
}

export type Box = [number, number, number, number];

export interface FeasibilityInput {
  /** Tracked face box in PLATE pixels, `[x1, y1, x2, y2]`. */
  faceBox: Box | null;
  /**
   * Trustworthy mouth point in PLATE pixels, or null. A null mouth leaves the
   * face-only behaviour exactly as it was — the planner must never invent a
   * mouth to constrain itself with.
   */
  mouth: { x: number; y: number } | null;
  /** Face share the gate will use for the band. */
  faceShare: number;
  /** FROZEN crop side length in plate pixels. */
  size: number;
  /** Existing face pad in plate pixels (`size * CONTAINMENT_PAD_RATIO`). */
  facePad: number;
  plateWidth: number;
  plateHeight: number;
  /**
   * Planner headroom in PLATE pixels, applied to the MOUTH interval only,
   * before any integer or even-pixel snapping. This is not a gate tolerance:
   * V461 still requires a true margin >= 0. The reserve exists so that
   * `Math.round`, the even-pixel snap and the `KEYFRAME_TOLERANCE_PX = 0.75`
   * decimation error cannot together push a satisfied constraint across the
   * boundary. Defaults to 0 so the pure contract stays exact.
   */
  mouthReservePx?: number;
}

const intersect = (a: Interval, b: Interval): Interval => ({
  lo: Math.max(a.lo, b.lo),
  hi: Math.min(a.hi, b.hi),
});

const isEmpty = (i: Interval): boolean => i.lo > i.hi;

/**
 * PURE — the interval of crop CENTRES that satisfies face, mouth and plate
 * simultaneously, for one frame and one frozen crop size.
 *
 * With `half = size / 2` and the crop centre `c`, the crop spans
 * `[c − half, c + half]`. The three constraints on the x axis are:
 *
 *   FACE   crop ⊇ faceBox ⊕ facePad
 *            c − half <= faceLeft  − facePad   →  c <= faceLeft  − facePad + half
 *            c + half >= faceRight + facePad   →  c >= faceRight + facePad − half
 *
 *   MOUTH  the COMPLETE V434 band around the mouth fits inside the crop.
 *          The band is `width` in crop fractions, so `bandHalfPx = width *
 *          size / 2` in plate pixels:
 *            c − half <= mouthX − bandHalfPx   →  c <= mouthX − bandHalfPx + half
 *            c + half >= mouthX + bandHalfPx   →  c >= mouthX + bandHalfPx − half
 *
 *   PLATE  half <= c <= plateWidth − half
 *
 * The y axis is identical with `height`, `faceTop/faceBottom` and
 * `plateHeight`. The reserve widens the mouth requirement inward on both
 * sides, shrinking the admissible interval rather than relaxing it.
 */
export function feasibleCropCentre(input: FeasibilityInput): CropCentreFeasibility {
  const size = Number(input.size);
  const half = size / 2;
  const pad = Number(input.facePad) || 0;
  const reserve = Number(input.mouthReservePx) || 0;

  // Plate is the only always-present constraint. A crop wider than the plate
  // has no admissible centre at all, which the emptiness test reports.
  let x: Interval = { lo: half, hi: Number(input.plateWidth) - half };
  let y: Interval = { lo: half, hi: Number(input.plateHeight) - half };

  const b = input.faceBox;
  if (Array.isArray(b) && b.length === 4 && b.every((n) => Number.isFinite(Number(n)))) {
    x = intersect(x, { lo: Number(b[2]) + pad - half, hi: Number(b[0]) - pad + half });
    y = intersect(y, { lo: Number(b[3]) + pad - half, hi: Number(b[1]) - pad + half });
  }

  const m = input.mouth;
  const share = Number(input.faceShare);
  const mouthUsable = !!m &&
    Number.isFinite(Number(m.x)) && Number.isFinite(Number(m.y)) &&
    Number.isFinite(share) && share > 0 && size > 0;

  if (mouthUsable) {
    const band = v434MouthBand(share);
    const halfBandX = (band.width * size) / 2 + reserve;
    const halfBandY = (band.height * size) / 2 + reserve;
    x = intersect(x, {
      lo: Number(m!.x) + halfBandX - half,
      hi: Number(m!.x) - halfBandX + half,
    });
    y = intersect(y, {
      lo: Number(m!.y) + halfBandY - half,
      hi: Number(m!.y) - halfBandY + half,
    });
  }

  const emptyAxis: FeasibilityAxis | null = isEmpty(x) ? "x" : isEmpty(y) ? "y" : null;
  return { ok: emptyAxis === null, x, y, emptyAxis, mouthConstrained: mouthUsable };
}

/** PURE — project a desired centre into a feasible interval. */
export function projectIntoInterval(desired: number, i: Interval): number {
  return clamp(desired, i.lo, i.hi);
}

// ── PLANNER-LEVEL INFEASIBILITY ────────────────────────────────────────────

/**
 * Bounded scalar diagnostics for a frame whose constraints cannot all hold.
 * No images, urls, base64 or payloads — only the numbers that name the
 * conflict.
 */
export interface MouthCropInfeasibility {
  reason: "dynamic_mouth_crop_infeasible";
  axis: FeasibilityAxis;
  frame: number;
  t: number | null;
  cropSize: number;
  faceWidth: number | null;
  faceHeight: number | null;
  mouthX: number | null;
  mouthY: number | null;
  bandWidthPx: number | null;
  bandHeightPx: number | null;
  intervalLo: number;
  intervalHi: number;
}

export function buildInfeasibility(params: {
  axis: FeasibilityAxis;
  frame: number;
  t: number | null;
  input: FeasibilityInput;
  feasibility: CropCentreFeasibility;
}): MouthCropInfeasibility {
  const { input: inp, feasibility: f, axis } = params;
  const b = inp.faceBox;
  const size = Number(inp.size);
  const band = Number.isFinite(Number(inp.faceShare)) && Number(inp.faceShare) > 0
    ? v434MouthBand(Number(inp.faceShare))
    : null;
  const iv = axis === "x" ? f.x : f.y;
  return {
    reason: "dynamic_mouth_crop_infeasible",
    axis,
    frame: params.frame,
    t: params.t,
    cropSize: size,
    faceWidth: b ? Number(b[2]) - Number(b[0]) : null,
    faceHeight: b ? Number(b[3]) - Number(b[1]) : null,
    mouthX: inp.mouth ? Number(inp.mouth.x) : null,
    mouthY: inp.mouth ? Number(inp.mouth.y) : null,
    bandWidthPx: band ? band.width * size : null,
    bandHeightPx: band ? band.height * size : null,
    intervalLo: iv.lo,
    intervalHi: iv.hi,
  };
}

// ── POST-DECIMATION VERIFICATION ───────────────────────────────────────────

export interface VerifyFrame {
  /** Path-relative time of the modelled rendered frame. */
  t: number;
  faceBox: Box | null;
  mouth: { x: number; y: number } | null;
}

export interface RenderCadenceVerdict {
  ok: boolean;
  checked: number;
  /** How many frames actually carried a trustworthy mouth. */
  mouthChecked: number;
  failedFrame: number | null;
  failedT: number | null;
  failedKind: "face" | "mouth" | null;
  failedMargin: number | null;
}

/**
 * PURE — replay the DECIMATED path at render cadence and re-assert both
 * contracts on the geometry that will actually be frozen.
 *
 * The dense solve plus the 2 px reserve already makes this provably
 * redundant: `decimateIndices` is Douglas-Peucker with a max-norm error bound
 * of `KEYFRAME_TOLERANCE_PX = 0.75` px, rounding and the even snap displace
 * the origin within [−1, +0.5] px, and with the crop size frozen the
 * containment predicate is linear in the crop origin — so a reserve above
 * 1.75 px cannot be crossed. This check exists anyway because "provably
 * redundant" is a statement about the code as written, and the invariant is
 * supposed to survive the code being changed.
 *
 * `sampleAt` must be the SAME interpolation the renderer uses.
 */
export function verifyPathAtRenderCadence(params: {
  frames: VerifyFrame[];
  faceShare: number;
  facePad: number;
  sampleAt: (t: number) => { x: number; y: number; size: number } | null;
}): RenderCadenceVerdict {
  const frames = Array.isArray(params.frames) ? params.frames : [];
  let checked = 0;
  let mouthChecked = 0;

  for (let i = 0; i < frames.length; i++) {
    const fr = frames[i];
    if (!fr) continue;
    const w = params.sampleAt(fr.t);
    if (!w || !(Number(w.size) > 0)) continue;
    checked++;

    const b = fr.faceBox;
    if (Array.isArray(b) && b.length === 4 && b.every((n) => Number.isFinite(Number(n)))) {
      const pad = Number(params.facePad) || 0;
      const inside = Number(b[0]) - pad >= w.x &&
        Number(b[1]) - pad >= w.y &&
        Number(b[2]) + pad <= w.x + w.size &&
        Number(b[3]) + pad <= w.y + w.size;
      if (!inside) {
        return {
          ok: false,
          checked,
          mouthChecked,
          failedFrame: i,
          failedT: fr.t,
          failedKind: "face",
          failedMargin: null,
        };
      }
    }

    if (fr.mouth && Number.isFinite(Number(fr.mouth.x)) && Number.isFinite(Number(fr.mouth.y))) {
      mouthChecked++;
      const roi = mouthRoiInCrop(params.faceShare, fr.mouth, w);
      const margin = roiContainmentMargin(roi);
      if (!roiFullyInside(roi)) {
        return {
          ok: false,
          checked,
          mouthChecked,
          failedFrame: i,
          failedT: fr.t,
          failedKind: "mouth",
          failedMargin: margin,
        };
      }
    }
  }

  return {
    ok: true,
    checked,
    mouthChecked,
    failedFrame: null,
    failedT: null,
    failedKind: null,
    failedMargin: null,
  };
}
