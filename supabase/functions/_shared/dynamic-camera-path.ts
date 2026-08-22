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

function medianOf3(values: number[]): number[] {
  return values.map((_, i) => {
    const slice = [values[Math.max(0, i - 1)], values[i], values[Math.min(values.length - 1, i + 1)]];
    slice.sort((a, b) => a - b);
    return slice[1];
  });
}

function forwardBackward(values: number[], alpha = 0.5): number[] {
  const n = values.length;
  if (n === 0) return [];
  const fwd = new Array<number>(n);
  fwd[0] = values[0];
  for (let i = 1; i < n; i++) fwd[i] = alpha * values[i] + (1 - alpha) * fwd[i - 1];
  const bwd = new Array<number>(n);
  bwd[n - 1] = values[n - 1];
  for (let i = n - 2; i >= 0; i--) bwd[i] = alpha * values[i] + (1 - alpha) * bwd[i + 1];
  return values.map((_, i) => (fwd[i] + bwd[i]) / 2);
}

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

/**
 * Builds the dynamic path. Size is taken verbatim from the frozen static crop;
 * only the window position varies. Never switches identity — the caller has
 * already resolved every sample to the ONE assigned face.
 */
export function buildDynamicCameraPath(input: BuildCameraPathInput): DynamicCameraPath {
  const { staticCrop, srcWidth, srcHeight } = input;
  const size = staticCrop.size;
  const half = size / 2;
  const validCount = input.samples.filter((s) => !!s.box).length;

  if (size <= 0 || validCount === 0) {
    return staticCameraPath(input);
  }

  const filled = interpolateSamples(input.samples);
  const pad = size * CONTAINMENT_PAD_RATIO;
  const maxX = Math.max(0, srcWidth - size);
  const maxY = Math.max(0, srcHeight - size);

  // ── 1. Desired centers: mouth at (0.5, MOUTH_TARGET_Y) of the crop ──────
  const rawCx: number[] = [];
  const rawCy: number[] = [];
  const mouths: Array<[number, number] | null> = [];
  const sources: KeyframeSource[] = [];

  for (let i = 0; i < filled.length; i++) {
    const s = filled[i];
    const box = s.box!;
    const hadBox = !!input.samples[i]?.box;
    let mouth: [number, number] | null = s.mouth ?? null;
    let src: KeyframeSource = mouth ? "mouth" : "face_estimate";
    if (!mouth) mouth = estimateMouthFromFace(box);
    if (!hadBox) src = "interpolated";
    mouths.push(mouth);
    sources.push(src);
    rawCx.push(mouth[0]);
    rawCy.push(mouth[1] + (0.5 - MOUTH_TARGET_Y) * size);
  }

  // ── 2. Outlier suppression + zero-phase smoothing ───────────────────────
  let cx = forwardBackward(medianOf3(rawCx));
  let cy = forwardBackward(medianOf3(rawCy));

  // ── 3. Dead zone + bounded step (anti-jitter, no snap) ──────────────────
  const dead = size * KEYFRAME_DEAD_ZONE;
  const maxStep = size * MAX_KEYFRAME_STEP;
  const stepLimit = (vals: number[]): number[] => {
    const out = [vals[0]];
    for (let i = 1; i < vals.length; i++) {
      const prev = out[i - 1];
      const err = vals[i] - prev;
      const eff = Math.abs(err) <= dead ? 0 : err - Math.sign(err) * dead;
      out.push(prev + clamp(eff, -maxStep, maxStep));
    }
    return out;
  };
  cx = stepLimit(cx);
  cy = stepLimit(cy);

  // ── 4. Containment: the assigned face may never leave the window ────────
  const keyframes: CameraPathKeyframe[] = [];
  for (let i = 0; i < filled.length; i++) {
    const b = filled[i].box!;
    let ccx = cx[i];
    let ccy = cy[i];
    const loX = b[2] + pad - half;
    const hiX = b[0] - pad + half;
    const loY = b[3] + pad - half;
    const hiY = b[1] - pad + half;
    if (loX <= hiX) ccx = clamp(ccx, loX, hiX);
    if (loY <= hiY) ccy = clamp(ccy, loY, hiY);

    const x = clamp(Math.round(ccx - half), 0, maxX);
    const y = clamp(Math.round(ccy - half), 0, maxY);
    const m = mouths[i];
    keyframes.push({
      t: Number(Math.max(0, filled[i].t - input.startSec).toFixed(4)),
      x: x % 2 === 0 ? x : Math.max(0, x - 1),
      y: y % 2 === 0 ? y : Math.max(0, y - 1),
      size,
      mx: m ? Math.round(m[0]) : null,
      my: m ? Math.round(m[1]) : null,
      src: sources[i],
    });
  }

  // ── 5. Travel metric → static equivalence ───────────────────────────────
  let travel = 0;
  for (let i = 1; i < keyframes.length; i++) {
    travel = Math.max(
      travel,
      Math.hypot(keyframes[i].x - keyframes[0].x, keyframes[i].y - keyframes[0].y) / size,
    );
  }
  const moving = travel > STATIC_TRAVEL_EPSILON;

  const path: DynamicCameraPath = {
    version: CAMERA_PATH_VERSION,
    srcWidth,
    srcHeight,
    startSec: Number(input.startSec.toFixed(3)),
    endSec: Number(input.endSec.toFixed(3)),
    outputSize: staticCrop.outputSize,
    keyframes,
    moving,
    sampleCount: input.samples.length,
    validSamples: validCount,
    reason: validCount === input.samples.length ? "tracked" : "partial_track",
    signature: "",
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

/** True when the path carries real movement worth rendering dynamically. */
export function isDynamicCameraPath(path: DynamicCameraPath | null | undefined): boolean {
  return !!path && Array.isArray(path.keyframes) && path.keyframes.length > 1 && path.moving === true;
}

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
