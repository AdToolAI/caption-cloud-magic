/**
 * v464-asd-projection.ts (V464-B) — PURE per-frame ASD box projection.
 * ---------------------------------------------------------------------------
 * WHY (V464-A proof)
 *
 * The dispatcher projected ONE anchor face box through ONE static crop and
 * repeated that single box N times. For a time-variant preclip (dynamic camera
 * path and/or a moving head) the mouth left that box: measured 2/32 frames
 * mouth-inside-box on the S01 NOOP cohort vs 24/32 on the GOLD MOVED cohort.
 * Sync-3 then processes a region without a mouth → a real NOOP.
 *
 * CONTRACT
 *
 *   plateFaceBox(t) → cropTransform(t) → preclipBox(t) → ASD[t]
 *
 *   x' = (x_plate(t) - crop_x(t)) * outputSize / crop_size(t)
 *   y' = (y_plate(t) - crop_y(t)) * outputSize / crop_size(t)
 *
 * INVARIANTS
 *   1. No constant box while the track or the crop path really moves.
 *   2. ASD[i] comes from the face track AND the crop transform of frame i
 *      (time-interpolated, never an anchor frame, never a nearest keyframe).
 *   3. Clamping happens ONLY after the final projection into 720×720 space.
 *   4. Registration is re-validated on sample frames before dispatch;
 *      an untrustworthy registration blocks the provider call.
 *
 * NOT in scope (deliberately): shrinking the ASD box towards the mouth. The
 * existing face/ASD geometry is only registered correctly in time here.
 */

import { sampleCameraPath } from "./dynamic-camera-path.ts";

export type Box = [number, number, number, number];

export interface PreclipCropRect {
  x: number;
  y: number;
  size: number;
  outputSize: number;
}

/** Plate-space face track sample. `t` is in PLATE-absolute seconds. */
export interface PlateTrackSample {
  t: number;
  box: Box | null;
  mouth: [number, number] | null;
}

export interface CameraPathLike {
  keyframes: Array<{ t: number; x: number; y: number; size: number; mx?: number | null; my?: number | null }>;
}

/** Movement below this (plate px, box-centre travel) counts as static. */
export const TRACK_STATIC_EPSILON_PX = 2;

/** Fraction of validated sample frames that must contain the mouth. */
export const MIN_MOUTH_CONTAINMENT_RATE = 0.9;

/** How many evenly spaced frames the pre-dispatch validation samples. */
export const VALIDATION_SAMPLE_FRAMES = 12;

const lerp = (a: number, b: number, f: number) => a + (b - a) * f;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Face-relative mouth estimate (same ratio the camera path uses). */
export function estimateMouthFromBox(b: Box): [number, number] {
  return [(b[0] + b[2]) / 2, b[1] + (b[3] - b[1]) * 0.78];
}

/**
 * Linear interpolation over the plate face track. Holds the first/last valid
 * sample outside the measured range. PURE.
 */
export function sampleTrackAt(
  samples: PlateTrackSample[] | null | undefined,
  tPlateSec: number,
): { box: Box | null; mouth: [number, number] | null } {
  const valid = (samples ?? []).filter((s) => Array.isArray(s.box) && s.box!.length === 4)
    .sort((a, b) => a.t - b.t);
  if (valid.length === 0) return { box: null, mouth: null };
  if (valid.length === 1 || tPlateSec <= valid[0].t) {
    return { box: valid[0].box!.slice() as Box, mouth: valid[0].mouth ?? null };
  }
  const last = valid[valid.length - 1];
  if (tPlateSec >= last.t) return { box: last.box!.slice() as Box, mouth: last.mouth ?? null };
  for (let i = 1; i < valid.length; i++) {
    if (tPlateSec <= valid[i].t) {
      const a = valid[i - 1];
      const b = valid[i];
      const span = b.t - a.t;
      const f = span > 0 ? (tPlateSec - a.t) / span : 0;
      const ab = a.box!;
      const bb = b.box!;
      const box: Box = [
        lerp(ab[0], bb[0], f),
        lerp(ab[1], bb[1], f),
        lerp(ab[2], bb[2], f),
        lerp(ab[3], bb[3], f),
      ];
      const mouth: [number, number] | null = a.mouth && b.mouth
        ? [lerp(a.mouth[0], b.mouth[0], f), lerp(a.mouth[1], b.mouth[1], f)]
        : (a.mouth ?? b.mouth ?? null);
      return { box, mouth };
    }
  }
  return { box: last.box!.slice() as Box, mouth: last.mouth ?? null };
}

/** Crop rect valid for preclip-relative time `t`. */
export function cropAt(
  cameraPath: CameraPathLike | null | undefined,
  staticCrop: PreclipCropRect,
  tPreclipSec: number,
): PreclipCropRect {
  const dyn = cameraPath && Array.isArray(cameraPath.keyframes) && cameraPath.keyframes.length > 1
    ? sampleCameraPath(cameraPath as never, tPreclipSec)
    : null;
  if (!dyn || !(dyn.size > 0)) return { ...staticCrop };
  return { x: dyn.x, y: dyn.y, size: dyn.size, outputSize: staticCrop.outputSize };
}

/** Plate → preclip projection. Clamps ONLY at the very end (invariant 3). */
export function projectPlateBoxToPreclip(box: Box, crop: PreclipCropRect): Box {
  const s = crop.outputSize / Math.max(1e-6, crop.size);
  const o = crop.outputSize;
  const x1 = (box[0] - crop.x) * s;
  const y1 = (box[1] - crop.y) * s;
  const x2 = (box[2] - crop.x) * s;
  const y2 = (box[3] - crop.y) * s;
  return [
    Math.round(clamp(Math.min(x1, x2), 0, o)),
    Math.round(clamp(Math.min(y1, y2), 0, o)),
    Math.round(clamp(Math.max(x1, x2), 0, o)),
    Math.round(clamp(Math.max(y1, y2), 0, o)),
  ];
}

export function projectPlatePointToPreclip(
  p: [number, number],
  crop: PreclipCropRect,
): [number, number] {
  const s = crop.outputSize / Math.max(1e-6, crop.size);
  return [
    Math.round(clamp((p[0] - crop.x) * s, 0, crop.outputSize)),
    Math.round(clamp((p[1] - crop.y) * s, 0, crop.outputSize)),
  ];
}

/**
 * Relative margins of the (already grown / contained) anchor dispatch box
 * around the projected anchor face box. Applying them per frame preserves the
 * EXISTING framing policy — only the time registration changes.
 */
function marginsOf(anchorFace: Box, anchorDispatch: Box): [number, number, number, number] {
  const w = Math.max(1, anchorFace[2] - anchorFace[0]);
  const h = Math.max(1, anchorFace[3] - anchorFace[1]);
  return [
    (anchorFace[0] - anchorDispatch[0]) / w,
    (anchorFace[1] - anchorDispatch[1]) / h,
    (anchorDispatch[2] - anchorFace[2]) / w,
    (anchorDispatch[3] - anchorFace[3]) / h,
  ];
}

export interface BuildAsdBoxesInput {
  frameCount: number;
  fps: number;
  staticCrop: PreclipCropRect;
  cameraPath?: CameraPathLike | null;
  /** Plate-space face track (PLATE-absolute seconds). */
  faceTrack?: PlateTrackSample[] | null;
  /** Plate start of the preclip window (t=0 of the preclip). */
  preclipStartSec: number;
  /** Anchor face box in PLATE space (the legacy single source). */
  anchorPlateBox: Box;
  /** Anchor box already projected + grown by the containment gate. */
  anchorDispatchBox: Box;
  /** Voiced windows in PRECLIP time base. */
  voicedWindowsSec: Array<[number, number]>;
  padFrames?: number;
}

export interface BuildAsdBoxesResult {
  /** Wire array: voiced frames carry a box, silent frames stay null. */
  boxes: Array<Box | null>;
  /** Box for every frame, before the voiced-window mask (validation input). */
  frameBoxes: Box[];
  /** Projected mouth per frame (measured or face-estimated). */
  frameMouths: Array<[number, number]>;
  registration: "per_frame" | "anchor_constant";
  cropSource: "camera_path" | "static";
  trackSource: "face_track" | "anchor";
  /** True when the per-frame boxes actually vary. */
  varying: boolean;
  /** Plate-space centre travel of the tracked face. */
  trackTravelPx: number;
  /** Preclip-space centre travel of the emitted boxes. */
  boxTravelPx: number;
}

/**
 * THE per-frame builder. `ASD[i]` is derived from face-track(t_i) and
 * cropTransform(t_i) of the SAME frame i.
 */
export function buildPerFrameAsdBoxes(input: BuildAsdBoxesInput): BuildAsdBoxesResult {
  const frameCount = Math.max(1, Math.round(input.frameCount));
  const fps = input.fps > 0 ? input.fps : 30;
  const hasTrack = Array.isArray(input.faceTrack) &&
    input.faceTrack!.filter((s) => Array.isArray(s.box)).length >= 2;
  const hasPath = !!input.cameraPath && Array.isArray(input.cameraPath.keyframes) &&
    input.cameraPath.keyframes.length > 1;

  const anchorFaceProjected = projectPlateBoxToPreclip(input.anchorPlateBox, input.staticCrop);
  const margins = marginsOf(anchorFaceProjected, input.anchorDispatchBox);

  const frameBoxes: Box[] = [];
  const frameMouths: Array<[number, number]> = [];
  let trackMin: [number, number] = [Infinity, Infinity];
  let trackMax: [number, number] = [-Infinity, -Infinity];

  for (let i = 0; i < frameCount; i++) {
    const tClip = i / fps;
    const tPlate = input.preclipStartSec + tClip;
    const crop = cropAt(hasPath ? input.cameraPath : null, input.staticCrop, tClip);
    const tracked = hasTrack ? sampleTrackAt(input.faceTrack, tPlate) : { box: null, mouth: null };
    const platedFace: Box = (tracked.box ?? input.anchorPlateBox).slice() as Box;
    const plateMouth: [number, number] = tracked.mouth ?? estimateMouthFromBox(platedFace);

    trackMin = [Math.min(trackMin[0], (platedFace[0] + platedFace[2]) / 2), Math.min(trackMin[1], (platedFace[1] + platedFace[3]) / 2)];
    trackMax = [Math.max(trackMax[0], (platedFace[0] + platedFace[2]) / 2), Math.max(trackMax[1], (platedFace[1] + platedFace[3]) / 2)];

    const face = projectPlateBoxToPreclip(platedFace, crop);
    const w = Math.max(1, face[2] - face[0]);
    const h = Math.max(1, face[3] - face[1]);
    const o = crop.outputSize;
    const grown: Box = [
      Math.round(clamp(face[0] - margins[0] * w, 0, o)),
      Math.round(clamp(face[1] - margins[1] * h, 0, o)),
      Math.round(clamp(face[2] + margins[2] * w, 0, o)),
      Math.round(clamp(face[3] + margins[3] * h, 0, o)),
    ];
    // Degenerate guard — never emit an empty box.
    if (grown[2] - grown[0] < 2 || grown[3] - grown[1] < 2) {
      frameBoxes.push(input.anchorDispatchBox.slice() as Box);
    } else {
      frameBoxes.push(grown);
    }
    frameMouths.push(projectPlatePointToPreclip(plateMouth, crop));
  }

  const trackTravelPx = Number.isFinite(trackMin[0])
    ? Math.hypot(trackMax[0] - trackMin[0], trackMax[1] - trackMin[1])
    : 0;
  const cx = frameBoxes.map((b) => (b[0] + b[2]) / 2);
  const cy = frameBoxes.map((b) => (b[1] + b[3]) / 2);
  const boxTravelPx = Math.hypot(Math.max(...cx) - Math.min(...cx), Math.max(...cy) - Math.min(...cy));
  const varying = frameBoxes.some((b) => b.join(",") !== frameBoxes[0].join(","));

  // Voiced-window mask — unchanged semantics (v124/v201).
  const pad = Math.max(0, Math.floor(input.padFrames ?? 2));
  const windows = (input.voicedWindowsSec ?? [])
    .map(([s, e]) => [
      Math.max(0, Math.floor(s * fps) - pad),
      Math.min(frameCount - 1, Math.ceil(e * fps) + pad),
    ] as [number, number])
    .filter(([fs, fe]) => Number.isFinite(fs) && Number.isFinite(fe) && fe >= fs);
  let boxes: Array<Box | null>;
  if (windows.length === 0) {
    boxes = frameBoxes.map((b) => b);
  } else {
    boxes = new Array(frameCount).fill(null);
    for (const [fs, fe] of windows) {
      for (let i = fs; i <= fe; i++) boxes[i] = frameBoxes[i];
    }
  }

  return {
    boxes,
    frameBoxes,
    frameMouths,
    registration: hasTrack || hasPath ? "per_frame" : "anchor_constant",
    cropSource: hasPath ? "camera_path" : "static",
    trackSource: hasTrack ? "face_track" : "anchor",
    varying,
    trackTravelPx: Number(trackTravelPx.toFixed(2)),
    boxTravelPx: Number(boxTravelPx.toFixed(2)),
  };
}

export interface AsdRegistrationVerdict {
  ok: boolean;
  reason: string;
  checkedFrames: number;
  containedFrames: number;
  containmentRate: number;
  worstMarginPx: number;
  boundsValid: boolean;
  lengthValid: boolean;
  constantBoxOnMovingTrack: boolean;
}

/**
 * Invariant 4 — pre-dispatch registration validation on sample frames.
 * Blocks a formally valid but semantically wrong box sequence.
 */
export function validateAsdRegistration(params: {
  built: BuildAsdBoxesResult;
  frameCount: number;
  outputSize: number;
  sampleFrames?: number;
}): AsdRegistrationVerdict {
  const { built, frameCount, outputSize } = params;
  const n = Math.max(2, Math.min(params.sampleFrames ?? VALIDATION_SAMPLE_FRAMES, frameCount));
  const lengthValid = built.boxes.length === frameCount && built.frameBoxes.length === frameCount;
  const boundsValid = built.frameBoxes.every((b) =>
    b.every((v) => Number.isFinite(v) && v >= 0 && v <= outputSize) && b[2] > b[0] && b[3] > b[1]
  );
  const constantBoxOnMovingTrack = !built.varying && built.trackTravelPx > TRACK_STATIC_EPSILON_PX;

  let contained = 0;
  let checked = 0;
  let worst = Infinity;
  for (let k = 0; k < n; k++) {
    const i = Math.min(frameCount - 1, Math.round((k * (frameCount - 1)) / (n - 1)));
    const b = built.frameBoxes[i];
    const m = built.frameMouths[i];
    if (!b || !m) continue;
    checked++;
    const margin = Math.min(m[0] - b[0], b[2] - m[0], m[1] - b[1], b[3] - m[1]);
    worst = Math.min(worst, margin);
    if (margin >= 0) contained++;
  }
  const rate = checked > 0 ? contained / checked : 0;
  const reason = !lengthValid
    ? "frame_count_mismatch"
    : !boundsValid
    ? "box_out_of_bounds"
    : constantBoxOnMovingTrack
    ? "constant_box_on_moving_track"
    : rate < MIN_MOUTH_CONTAINMENT_RATE
    ? "mouth_outside_box"
    : "ok";

  return {
    ok: reason === "ok",
    reason,
    checkedFrames: checked,
    containedFrames: contained,
    containmentRate: Number(rate.toFixed(3)),
    worstMarginPx: Number.isFinite(worst) ? Math.round(worst) : -9999,
    boundsValid,
    lengthValid,
    constantBoxOnMovingTrack,
  };
}
