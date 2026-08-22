/**
 * dynamic-camera-path.ts (V452) — PURE dynamic crop geometry for the
 * single-face preclip and its inverse reprojection.
 * ---------------------------------------------------------------------------
 * WHY
 *
 * `DialogTurnFaceCropVideo` used ONE fixed (cropX, cropY, cropSize) for a whole
 * turn. When the assigned speaker moves, the mouth drifts out of the frozen
 * window — the provider then sees hair/shoulder instead of a mouth, and the
 * v404 mouth-band ROI measures the wrong anatomy (proved in V451).
 *
 * V452 restores the v400 T8 capability: geometry may vary over time.
 *
 * CONTRACT — `Identity is static; geometry is dynamic.`
 *   - The assignment lock (speaker → face slot) is NEVER touched here.
 *   - This module only moves a window of CONSTANT size over the plate.
 *     Crop size, face-share and mouth-anchor policy stay exactly where
 *     `computeMouthCenteredCrop` put them (no framing-policy change).
 *   - Everything in this file is pure and deterministic: same input →
 *     byte-identical path and signature.
 */

// V452 uses the PROVEN v359 planner as the authoritative movement planner.
// Only the trajectory is taken from it; the crop SIZE stays frozen (V445/V450).
import {
  type Box as PlannerBox,
  type CropWindow,
  planCameraPath,
} from "./camera-path.ts";

export const CAMERA_PATH_VERSION = "v452";

/** Vertical target of the mouth inside the crop (v400 framing target). */
export const MOUTH_TARGET_Y = 0.62;

/** Face-relative mouth estimate when no mouth landmark exists. */
export const FACE_MOUTH_Y_RATIO = 0.78;

/** Safety margin (fraction of crop side) the face box keeps from the edge. */
export const CONTAINMENT_PAD_RATIO = 0.04;

/** Dead zone (fraction of crop side): below this the camera does not react. */
export const KEYFRAME_DEAD_ZONE = 0.02;

/** Maximum center movement between two keyframes (fraction of crop side). */
export const MAX_KEYFRAME_STEP = 0.28;

/** Sampling padding at both ends of the turn window (fraction of duration). */
export const TRACK_SAMPLE_PADDING = 0.05;

/** Bounded number of remote tracking samples per pass. */
export const TRACK_SAMPLE_COUNT = 6;
export const TRACK_SAMPLE_COUNT_MAX = 8;

/** Below this total travel (fraction of crop side) the path counts as static. */
export const STATIC_TRAVEL_EPSILON = 0.01;

export type Box = [number, number, number, number];

export type KeyframeSource = "mouth" | "face_estimate" | "static" | "interpolated";

export interface CameraPathKeyframe {
  /** Seconds relative to the preclip start (t=0 is the first preclip frame). */
  t: number;
  /** Crop rect in PLATE pixel space. */
  x: number;
  y: number;
  size: number;
  /** Mouth point in PLATE pixel space when known (telemetry + measurement). */
  mx: number | null;
  my: number | null;
  src: KeyframeSource;
}

export interface DynamicCameraPath {
  version: string;
  /** Plate (source) dimensions the keyframes are expressed in. */
  srcWidth: number;
  srcHeight: number;
  /** Preclip window on the plate timeline. */
  startSec: number;
  endSec: number;
  /** Square preclip output size in pixels. */
  outputSize: number;
  keyframes: CameraPathKeyframe[];
  /** false → geometrically equivalent to the legacy fixed crop. */
  moving: boolean;
  sampleCount: number;
  validSamples: number;
  /** "tracked" | "static_fallback" | "partial_track" */
  reason: string;
  /** Stable hash over the geometry — bound into the preclip signature. */
  signature: string;
  /** v359 planner telemetry (evidence only, never a gate). */
  plannerFrames?: number;
  plannerContainedRatio?: number;
  plannerMaxJump?: number;
}

export interface TrackSample {
  /** Seconds relative to the preclip start. */
  t: number;
  /** Assignment-locked face box in plate pixels, or null when unresolved. */
  box: Box | null;
  /** Mouth landmark in plate pixels when the detector supplied one. */
  mouth: [number, number] | null;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Deterministic sample timestamps (plate-relative seconds). */
export function trackSampleTimes(
  startSec: number,
  endSec: number,
  n: number = TRACK_SAMPLE_COUNT,
): number[] {
  const count = Math.max(2, Math.min(TRACK_SAMPLE_COUNT_MAX, Math.round(n)));
  const dur = Math.max(0, endSec - startSec);
  const a = startSec + TRACK_SAMPLE_PADDING * dur;
  const b = startSec + (1 - TRACK_SAMPLE_PADDING) * dur;
  const step = count > 1 ? (b - a) / (count - 1) : 0;
  return Array.from({ length: count }, (_, i) => Number((a + step * i).toFixed(4)));
}

export function boxCenter(b: Box): [number, number] {
  return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
}

/** Face-relative mouth estimate — never a global fixed ROI. */
export function estimateMouthFromFace(b: Box): [number, number] {
  const w = Math.max(0, b[2] - b[0]);
  const h = Math.max(0, b[3] - b[1]);
  return [b[0] + w / 2, b[1] + h * FACE_MOUTH_Y_RATIO];
}

/** Intersection over union of two plate-pixel boxes. */
export function boxIoU(a: Box, b: Box): number {
  const ix1 = Math.max(a[0], b[0]);
  const iy1 = Math.max(a[1], b[1]);
  const ix2 = Math.min(a[2], b[2]);
  const iy2 = Math.min(a[3], b[3]);
  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const inter = iw * ih;
  const areaA = Math.max(0, a[2] - a[0]) * Math.max(0, a[3] - a[1]);
  const areaB = Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
  const union = areaA + areaB - inter;
  return union > 0 ? inter / union : 0;
}

// NOTE: no second smoothing system lives here. Median filtering, zero-phase
// forward/backward smoothing, look-ahead, dead zone and pan/acceleration
// limits are all owned by the v359 planner (`camera-path.ts`).

/** Fills null samples by bounded linear interpolation between valid neighbours. */
export function interpolateSamples(samples: TrackSample[]): TrackSample[] {
  const out = samples.map((s) => ({ ...s }));
  const n = out.length;
  const validIdx = out.map((s, i) => (s.box ? i : -1)).filter((i) => i >= 0);
  if (validIdx.length === 0) return out;

  for (let i = 0; i < n; i++) {
    if (out[i].box) continue;
    const before = validIdx.filter((k) => k < i).pop();
    const after = validIdx.find((k) => k > i);
    if (before !== undefined && after !== undefined) {
      const f = (i - before) / (after - before);
      const a = out[before].box!;
      const b = out[after].box!;
      out[i].box = [
        a[0] + (b[0] - a[0]) * f,
        a[1] + (b[1] - a[1]) * f,
        a[2] + (b[2] - a[2]) * f,
        a[3] + (b[3] - a[3]) * f,
      ];
      const ma = out[before].mouth;
      const mb = out[after].mouth;
      out[i].mouth = ma && mb ? [ma[0] + (mb[0] - ma[0]) * f, ma[1] + (mb[1] - ma[1]) * f] : null;
    } else if (before !== undefined) {
      out[i].box = out[before].box;
      out[i].mouth = out[before].mouth;
    } else if (after !== undefined) {
      out[i].box = out[after].box;
      out[i].mouth = out[after].mouth;
    }
  }
  return out;
}

export interface BuildCameraPathInput {
  samples: TrackSample[];
  /** The frozen static crop (authority for SIZE — never recomputed here). */
  staticCrop: { x: number; y: number; size: number; outputSize: number };
  srcWidth: number;
  srcHeight: number;
  startSec: number;
  endSec: number;
  /** Preclip frame rate; the planner works per frame. Defaults to PATH_FPS. */
  fps?: number;
}

/** Static single-keyframe path — behaviourally identical to the fixed crop. */
export function staticCameraPath(input: Omit<BuildCameraPathInput, "samples">): DynamicCameraPath {
  const { staticCrop: c } = input;
  const path: DynamicCameraPath = {
    version: CAMERA_PATH_VERSION,
    srcWidth: input.srcWidth,
    srcHeight: input.srcHeight,
    startSec: Number(input.startSec.toFixed(3)),
    endSec: Number(input.endSec.toFixed(3)),
    outputSize: c.outputSize,
    keyframes: [{ t: 0, x: c.x, y: c.y, size: c.size, mx: null, my: null, src: "static" }],
    moving: false,
    sampleCount: 0,
    validSamples: 0,
    reason: "static_fallback",
    signature: "",
  };
  path.signature = cameraPathSignature(path);
  return path;
}

/** Frame cadence the preclip is rendered at (Remotion Lambda dialog preclip). */
export const PATH_FPS = 30;

/** Keyframe decimation tolerance in plate pixels (visually lossless). */
export const KEYFRAME_TOLERANCE_PX = 0.75;

/** Hard cap on persisted keyframes per pass. */
export const MAX_KEYFRAMES = 240;

/**
 * Deterministic densification: the bounded Rekognition samples become the
 * per-frame box series `planCameraPath` expects. Linear between measured
 * samples, hold at both ends. No new identity decision happens here — the
 * caller already resolved every sample to the ONE assigned face.
 */
export function densifySamplesToFrames(
  samples: TrackSample[],
  startSec: number,
  endSec: number,
  fps: number,
): { boxes: Array<PlannerBox | null>; mouths: Array<[number, number] | null>; measured: boolean[] } {
  const dur = Math.max(0, endSec - startSec);
  const n = Math.max(2, Math.round(dur * fps));
  const valid = samples.filter((s) => !!s.box);
  const boxes: Array<PlannerBox | null> = new Array(n).fill(null);
  const mouths: Array<[number, number] | null> = new Array(n).fill(null);
  const measured: boolean[] = new Array(n).fill(false);
  if (valid.length === 0) return { boxes, mouths, measured };

  for (let i = 0; i < n; i++) {
    const t = startSec + (dur * i) / (n - 1);
    let a = valid[0];
    let b = valid[valid.length - 1];
    for (let k = 0; k < valid.length; k++) {
      if (valid[k].t <= t) a = valid[k];
      if (valid[k].t >= t) {
        b = valid[k];
        break;
      }
    }
    const span = b.t - a.t;
    const f = span > 0 ? clamp((t - a.t) / span, 0, 1) : 0;
    const ab = a.box!;
    const bb = b.box!;
    boxes[i] = [
      ab[0] + (bb[0] - ab[0]) * f,
      ab[1] + (bb[1] - ab[1]) * f,
      ab[2] + (bb[2] - ab[2]) * f,
      ab[3] + (bb[3] - ab[3]) * f,
    ];
    const am = a.mouth;
    const bm = b.mouth;
    mouths[i] = am && bm ? [am[0] + (bm[0] - am[0]) * f, am[1] + (bm[1] - am[1]) * f] : (am ?? bm ?? null);
    measured[i] = valid.some((s) => Math.abs(s.t - t) < 0.5 / fps);
  }
  return { boxes, mouths, measured };
}

/** Ramer–Douglas–Peucker over the (t, x, y) polyline — deterministic. */
function decimateIndices(xs: number[], ys: number[], tol: number): number[] {
  const n = xs.length;
  if (n <= 2) return xs.map((_, i) => i);
  const keep = new Set<number>([0, n - 1]);
  const stack: Array<[number, number]> = [[0, n - 1]];
  while (stack.length > 0) {
    const [lo, hi] = stack.pop()!;
    if (hi - lo < 2) continue;
    let worst = -1;
    let worstErr = tol;
    for (let i = lo + 1; i < hi; i++) {
      const f = (i - lo) / (hi - lo);
      const ex = Math.abs(xs[i] - (xs[lo] + (xs[hi] - xs[lo]) * f));
      const ey = Math.abs(ys[i] - (ys[lo] + (ys[hi] - ys[lo]) * f));
      const err = Math.max(ex, ey);
      if (err > worstErr) {
        worstErr = err;
        worst = i;
      }
    }
    if (worst >= 0) {
      keep.add(worst);
      stack.push([lo, worst], [worst, hi]);
    }
  }
  return [...keep].sort((a, b) => a - b);
}

/**
 * Builds the dynamic path.
 *
 * AUTHORITATIVE PLANNER: `planCameraPath` (v359) — gap handling, constant
 * zoom, median + forward/backward smoothing, LOOK_AHEAD_FRAMES, dead zone,
 * pan/acceleration limits and containment metrics all come from there. This
 * function is a bounded ADAPTER around it:
 *
 *   1. densify the bounded samples to a per-frame box series (deterministic);
 *   2. let `planCameraPath` produce the trajectory;
 *   3. take ONLY its per-frame centre trajectory and re-window it with the
 *      FROZEN static crop size — v359's constant-zoom result would change the
 *      crop size, which V445 (geometry signature) and V450 (frozen wire)
 *      forbid. Framing policy stays with `computeMouthCenteredCrop`;
 *   4. re-assert containment against the frozen size;
 *   5. decimate to keyframes and decide static equivalence.
 *
 * If the resulting travel is within `STATIC_TRAVEL_EPSILON`, the EXACT frozen
 * static crop is returned — never a mouth-derived alternative — so a
 * non-moving track is byte-identical to the legacy fixed crop.
 */
export function buildDynamicCameraPath(input: BuildCameraPathInput): DynamicCameraPath {
  const { staticCrop, srcWidth, srcHeight } = input;
  const size = staticCrop.size;
  const half = size / 2;
  const fps = input.fps && input.fps > 0 ? input.fps : PATH_FPS;
  const validCount = input.samples.filter((s) => !!s.box).length;

  if (size <= 0 || validCount === 0) return staticCameraPath(input);

  const dense = densifySamplesToFrames(input.samples, input.startSec, input.endSec, fps);
  if (!dense.boxes.some((b) => !!b)) return staticCameraPath(input);

  // ── v359 planner: the authoritative trajectory ──────────────────────────
  const planned = planCameraPath({
    boxes: dense.boxes,
    plateWidth: srcWidth,
    plateHeight: srcHeight,
    minSize: size,
  });

  // ── Re-window on the FROZEN size, then re-assert containment ────────────
  const pad = size * CONTAINMENT_PAD_RATIO;
  const maxX = Math.max(0, srcWidth - size);
  const maxY = Math.max(0, srcHeight - size);
  const n = planned.path.length;
  const xs: number[] = new Array(n);
  const ys: number[] = new Array(n);

  for (let i = 0; i < n; i++) {
    const w: CropWindow = planned.path[i];
    let ccx = w.x + w.size / 2;
    let ccy = w.y + w.size / 2;
    const b = dense.boxes[i];
    if (b) {
      const loX = b[2] + pad - half;
      const hiX = b[0] - pad + half;
      const loY = b[3] + pad - half;
      const hiY = b[1] - pad + half;
      if (loX <= hiX) ccx = clamp(ccx, loX, hiX);
      if (loY <= hiY) ccy = clamp(ccy, loY, hiY);
    }
    const x = clamp(Math.round(ccx - half), 0, maxX);
    const y = clamp(Math.round(ccy - half), 0, maxY);
    xs[i] = x % 2 === 0 ? x : Math.max(0, x - 1);
    ys[i] = y % 2 === 0 ? y : Math.max(0, y - 1);
  }

  // ── Static equivalence BEFORE materialising anything ────────────────────
  let travel = 0;
  for (let i = 1; i < n; i++) {
    travel = Math.max(travel, Math.hypot(xs[i] - xs[0], ys[i] - ys[0]) / size);
  }
  if (!(travel > STATIC_TRAVEL_EPSILON)) {
    // Static-equivalent → the EXACT frozen crop, at every time.
    const flat = staticCameraPath(input);
    flat.sampleCount = input.samples.length;
    flat.validSamples = validCount;
    flat.reason = "static_equivalent";
    flat.signature = cameraPathSignature(flat);
    return flat;
  }

  // ── Decimate to keyframes (visually lossless, deterministic) ────────────
  let idx = decimateIndices(xs, ys, KEYFRAME_TOLERANCE_PX);
  if (idx.length > MAX_KEYFRAMES) {
    const stride = Math.ceil(idx.length / MAX_KEYFRAMES);
    idx = idx.filter((_, k) => k % stride === 0 || k === idx.length - 1);
  }
  const dur = Math.max(0, input.endSec - input.startSec);
  const keyframes: CameraPathKeyframe[] = idx.map((i) => {
    const m = dense.mouths[i];
    const b = dense.boxes[i];
    const mouth = m ?? (b ? estimateMouthFromFace(b as Box) : null);
    const src: KeyframeSource = dense.measured[i] ? (m ? "mouth" : "face_estimate") : "interpolated";
    return {
      t: Number(((dur * i) / Math.max(1, n - 1)).toFixed(4)),
      x: xs[i],
      y: ys[i],
      size,
      mx: mouth ? Math.round(mouth[0]) : null,
      my: mouth ? Math.round(mouth[1]) : null,
      src,
    };
  });

  const path: DynamicCameraPath = {
    version: CAMERA_PATH_VERSION,
    srcWidth,
    srcHeight,
    startSec: Number(input.startSec.toFixed(3)),
    endSec: Number(input.endSec.toFixed(3)),
    outputSize: staticCrop.outputSize,
    keyframes,
    moving: true,
    sampleCount: input.samples.length,
    validSamples: validCount,
    reason: validCount === input.samples.length ? "tracked" : "partial_track",
    signature: "",
    plannerFrames: n,
    plannerContainedRatio: Number(planned.containedRatio.toFixed(4)),
    plannerMaxJump: Number(planned.maxJump.toFixed(4)),
  };
  path.signature = cameraPathSignature(path);
  return path;
}

/** Stable, order-sensitive geometry hash. Bound into the preclip signature. */
export function cameraPathSignature(path: DynamicCameraPath): string {
  const body = [
    path.version,
    `${path.srcWidth}x${path.srcHeight}`,
    `o=${path.outputSize}`,
    `w=${path.startSec.toFixed(3)}-${path.endSec.toFixed(3)}`,
    path.keyframes
      .map((k) => `${k.t.toFixed(3)}:${k.x},${k.y},${k.size}`)
      .join(";"),
  ].join("|");
  // FNV-1a 32 bit — deterministic, dependency free, sufficient for cache keys.
  let h = 0x811c9dc5;
  for (let i = 0; i < body.length; i++) {
    h ^= body.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return `cp${path.keyframes.length}_${h.toString(16)}`;
}

/** PURE — crop rect at a given preclip-relative time. Linear between keys. */
export function sampleCameraPath(
  path: { keyframes: CameraPathKeyframe[] } | null | undefined,
  tSec: number,
): { x: number; y: number; size: number } | null {
  const kf = path?.keyframes;
  if (!Array.isArray(kf) || kf.length === 0) return null;
  if (kf.length === 1 || tSec <= kf[0].t) return { x: kf[0].x, y: kf[0].y, size: kf[0].size };
  const last = kf[kf.length - 1];
  if (tSec >= last.t) return { x: last.x, y: last.y, size: last.size };
  for (let i = 1; i < kf.length; i++) {
    if (tSec <= kf[i].t) {
      const a = kf[i - 1];
      const b = kf[i];
      const span = b.t - a.t;
      const f = span > 0 ? (tSec - a.t) / span : 0;
      return {
        x: a.x + (b.x - a.x) * f,
        y: a.y + (b.y - a.y) * f,
        size: a.size + (b.size - a.size) * f,
      };
    }
  }
  return { x: last.x, y: last.y, size: last.size };
}

/**
 * THE single predicate deciding whether a path is used at all.
 *
 * Preclip render (`DialogTurnFaceCropVideo`) and T13 reprojection
 * (`DialogStitchVideo`) MUST agree bit for bit: either both follow the path or
 * both use the frozen static crop. Anything else would render the preclip with
 * one geometry and paste it back with another.
 */
export function shouldUseCameraPath(path: DynamicCameraPath | null | undefined): boolean {
  return (
    !!path &&
    path.moving === true &&
    Array.isArray(path.keyframes) &&
    path.keyframes.length > 1 &&
    typeof path.signature === "string" &&
    path.signature.length > 0
  );
}

/** Alias kept for readability at call sites. */
export const isDynamicCameraPath = shouldUseCameraPath;

/**
 * Per-sample mouth ROI in PRECLIP-normalized coordinates. Telemetry/evidence
 * only — it does NOT feed the frozen v404 verdict (see V452 §7).
 */
export function mouthRoiSamples(
  path: DynamicCameraPath,
  roiWidth = 0.28,
  roiHeight = 0.12,
): Array<{ t: number; centerX: number; centerY: number; width: number; height: number; src: KeyframeSource }> {
  return path.keyframes
    .filter((k) => k.mx !== null && k.my !== null && k.size > 0)
    .map((k) => ({
      t: k.t,
      centerX: Number(clamp((k.mx! - k.x) / k.size, 0, 1).toFixed(4)),
      centerY: Number(clamp((k.my! - k.y) / k.size, 0, 1).toFixed(4)),
      width: roiWidth,
      height: roiHeight,
      src: k.src,
    }));
}
