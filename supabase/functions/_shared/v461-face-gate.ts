/**
 * V461 A — v400 FACE-GATE (restored, hard, pre-dispatch)
 * ---------------------------------------------------------------------------
 * V460 evidence (scene be60d106…, pass 4): a pre-clip with
 * `preclip_face_share = 0.218` was dispatched to the provider although the
 * v400 input contract (T8) requires ≥ 0.24. The value was computed and logged
 * — but never gated. The pass then burned the full NOOP ladder.
 *
 * This module is the ONE place that decides whether a pre-clip may be sent to
 * the provider. It is PURE (no I/O, no thresholds elsewhere).
 *
 * HARD RULES
 *   - `face_share ≥ 0.24` and `face_size_provider_px ≥ 144` are TWO
 *     INDEPENDENT guards. The normalized share is NEVER used as a substitute
 *     for the pixel size: the pixel size is derived from the real face bbox
 *     scaled by `outputSize / crop.size`.
 *   - The mouth ROI must lie fully inside the crop (unclamped check).
 *   - The frozen geometry identity must match the pass being dispatched.
 *   - A pure pose estimate (no mouth landmark) is NOT forbidden — V461 has no
 *     evidence for that. The ROI check is then reported as `unchecked`.
 *   - Full-plate dispatches (single speaker, no pre-clip) are out of scope.
 *   - Missing geometry on a pre-clip dispatch is fail-closed: an input that
 *     cannot be verified is not sent.
 */

import { V434_MOUTH_BAND } from "./v434-motion-roi.ts";

export const V461_FACE_GATE_VERSION = "v461";

/** v400 T8 — face area / crop area. */
export const V461_FACE_SHARE_FLOOR = 0.24;
/** v400 T9 — face side length in PROVIDER pixels (post-scale). */
export const V461_FACE_SIZE_PROVIDER_PX_FLOOR = 144;

export type V461GateCheck =
  | "geometry"
  | "face_share"
  | "face_size_px"
  | "mouth_roi"
  | "identity";

export interface V461Identity {
  runId?: string | null;
  generation?: number | null;
  passIdx?: number | null;
  speakerIdx?: number | null;
}

export interface V461FaceGateInput {
  /** false → full-plate dispatch, gate is not applicable. */
  usePreclip: boolean;
  /** `preclip_face_share` */
  faceShare?: number | null;
  /** `preclip_from_bbox` — face box in PLATE pixels. */
  faceBbox?: number[] | null;
  /** `preclip_crop` — plate-pixel square crop + provider output size. */
  crop?: { size?: number | null; outputSize?: number | null } | null;
  /** `preclip_anchor` — `mouth` when a real mouth landmark drove the crop. */
  anchor?: string | null;
  /** `preclip_mouth_offset_xy` — SIGNED plate-pixel vector to the crop centre. */
  mouthOffsetXy?: { dx?: number | null; dy?: number | null } | null;
  /** `preclip_geometry_identity` — identity the geometry was frozen with. */
  identity?: V461Identity | null;
  /** Identity of the pass being dispatched right now. */
  expectedIdentity?: V461Identity | null;
  /**
   * `preclip_camera_path_dynamic` — the renderer followed a MOVING crop.
   * The static `crop` + `mouthOffsetXy` pair then describes a geometry that
   * was never rendered.
   */
  cameraPathDynamic?: boolean | null;
  /**
   * `preclip_camera_path.keyframes` — the FROZEN geometry the renderer
   * actually consumed, in PLATE pixels.
   *
   * NOT `preclip_mouth_roi_samples`: those are clamped to [0,1] and can
   * therefore never express a mouth that left the crop. A gate fed clamped
   * values is a gate that cannot fail.
   */
  cameraPathKeyframes?: Array<V461CameraKeyframe | null | undefined> | null;
}

/** Subset of `CameraPathKeyframe` this gate needs. Plate pixels. */
export interface V461CameraKeyframe {
  t?: number | null;
  x?: number | null;
  y?: number | null;
  size?: number | null;
  mx?: number | null;
  my?: number | null;
}

export interface V461FaceGateMetrics {
  face_share: number | null;
  face_share_floor: number;
  face_size_provider_px: number | null;
  face_size_floor_px: number;
  mouth_roi: { centerX: number; centerY: number; width: number; height: number } | null;
  mouth_roi_checked: boolean;
  scale_provider_per_plate: number | null;
  /** Which geometry the ROI decision was taken on. */
  mouth_roi_source: "static" | "camera_path" | null;
  /** Keyframes actually evaluated (0 on the static branch). */
  mouth_roi_keyframes_checked: number;
  /** `t` of the tightest keyframe, seconds relative to the preclip start. */
  mouth_roi_worst_t: number | null;
  /**
   * Smallest normalized distance from the band edge to the frame edge.
   * Negative = overhang, i.e. the band does not fit.
   */
  mouth_roi_worst_margin: number | null;
}

export interface V461FaceGateResult {
  ok: boolean;
  /** `skipped` when the gate is not applicable (full-plate dispatch). */
  status: "pass" | "block" | "skipped";
  code: string;
  reason: string;
  failedCheck: V461GateCheck | null;
  checks: Record<V461GateCheck, boolean | null>;
  metrics: V461FaceGateMetrics;
  version: string;
}

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** `num`, but an ABSENT value stays absent instead of coercing to 0. */
const strictNum = (v: unknown): number | null =>
  v === null || v === undefined || v === "" ? null : num(v);

function identityMatches(a?: V461Identity | null, b?: V461Identity | null): boolean {
  if (!a || !b) return false;
  const cmp = (x: unknown, y: unknown): boolean => {
    if (x === null || x === undefined || y === null || y === undefined) return true;
    return String(x) === String(y);
  };
  return cmp(a.runId, b.runId) &&
    cmp(a.generation, b.generation) &&
    cmp(a.passIdx, b.passIdx) &&
    cmp(a.speakerIdx, b.speakerIdx);
}

/**
 * PURE — is the band fully inside the frame?
 *
 * Extracted verbatim from the original inline expression so the static and
 * the dynamic branch cannot drift apart: same operators, same order, so the
 * static decision stays bit-identical.
 */
function roiFullyInside(roi: { centerX: number; centerY: number; width: number; height: number }): boolean {
  return roi.centerX - roi.width / 2 >= 0 &&
    roi.centerX + roi.width / 2 <= 1 &&
    roi.centerY - roi.height / 2 >= 0 &&
    roi.centerY + roi.height / 2 <= 1;
}

/** PURE — DIAGNOSTIC distance to the frame edge. Negative = overhang. */
function roiMargin(roi: { centerX: number; centerY: number; width: number; height: number }): number {
  return Math.min(
    roi.centerX - roi.width / 2,
    1 - (roi.centerX + roi.width / 2),
    roi.centerY - roi.height / 2,
    1 - (roi.centerY + roi.height / 2),
  );
}

/** PURE — the mouth band size. Unchanged V434 constants and derivation. */
function mouthBand(faceShare: number): { width: number; height: number } {
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

/** A keyframe that can actually place a mouth inside a crop. */
export interface V461UsableKeyframe {
  t: number;
  x: number;
  y: number;
  size: number;
  mx: number;
  my: number;
}

/**
 * PURE — keyframes that carry a crop AND a mouth. Everything else cannot
 * support a containment statement and is dropped; if nothing survives, the
 * caller falls back to the static contract.
 */
export function usableCameraKeyframes(
  keyframes: Array<V461CameraKeyframe | null | undefined> | null | undefined,
): V461UsableKeyframe[] {
  if (!Array.isArray(keyframes)) return [];
  const out: V461UsableKeyframe[] = [];
  for (const k of keyframes) {
    if (!k) continue;
    // `num` alone is NOT enough: `Number(null)` is 0 and `Number("")` is 0,
    // so a keyframe with NO mouth (`mx: null` is a legal CameraPathKeyframe)
    // would read as a mouth at plate x=0 and fabricate an escape.
    const x = strictNum(k.x), y = strictNum(k.y), size = strictNum(k.size);
    const mx = strictNum(k.mx), my = strictNum(k.my);
    if (x === null || y === null || size === null || size <= 0) continue;
    if (mx === null || my === null) continue;
    out.push({ t: num(k.t) ?? 0, x, y, size, mx, my });
  }
  return out;
}

/**
 * PURE — the mouth band at ONE rendered keyframe, inside that keyframe own
 * crop. UNCLAMPED on purpose: a clamped centre cannot express an escape.
 */
export function unclampedMouthRoiAtKeyframe(
  faceShare: number,
  k: V461UsableKeyframe,
): { centerX: number; centerY: number; width: number; height: number } {
  const { width, height } = mouthBand(faceShare);
  return {
    centerX: (k.mx - k.x) / k.size,
    centerY: (k.my - k.y) / k.size,
    width,
    height,
  };
}

/**
 * PURE — unclamped mouth band in provider-normalized coordinates. Unlike
 * `deriveMouthRoi` (which clamps the band into frame for MEASUREMENT), the
 * gate needs to know whether the band would have to be clamped at all: a
 * clamped band means the mouth is not fully inside the crop.
 */
export function unclampedMouthRoi(
  faceShare: number,
  mouthOffsetXy: { dx: number; dy: number } | null,
  cropSizePlatePx: number,
): { centerX: number; centerY: number; width: number; height: number } {
  const { width, height } = mouthBand(faceShare);
  const centerX = mouthOffsetXy ? 0.5 + mouthOffsetXy.dx / cropSizePlatePx : 0.5;
  const centerY = mouthOffsetXy ? 0.5 + mouthOffsetXy.dy / cropSizePlatePx : 0.5;
  return { centerX, centerY, width, height };
}

/** PURE — the v400 input contract, evaluated immediately before dispatch. */
export function evaluateV461FaceGate(input: V461FaceGateInput): V461FaceGateResult {
  const checks: Record<V461GateCheck, boolean | null> = {
    geometry: null,
    face_share: null,
    face_size_px: null,
    mouth_roi: null,
    identity: null,
  };
  const metrics: V461FaceGateMetrics = {
    face_share: null,
    face_share_floor: V461_FACE_SHARE_FLOOR,
    face_size_provider_px: null,
    face_size_floor_px: V461_FACE_SIZE_PROVIDER_PX_FLOOR,
    mouth_roi: null,
    mouth_roi_checked: false,
    scale_provider_per_plate: null,
    mouth_roi_source: null,
    mouth_roi_keyframes_checked: 0,
    mouth_roi_worst_t: null,
    mouth_roi_worst_margin: null,
  };

  const done = (
    status: V461FaceGateResult["status"],
    code: string,
    reason: string,
    failedCheck: V461GateCheck | null,
  ): V461FaceGateResult => ({
    ok: status !== "block",
    status,
    code,
    reason,
    failedCheck,
    checks,
    metrics,
    version: V461_FACE_GATE_VERSION,
  });

  if (!input?.usePreclip) {
    return done("skipped", "gate_not_applicable", "full_plate_dispatch", null);
  }

  // ── 1. Geometry present and coherent ─────────────────────────────────────
  const cropSize = num(input.crop?.size);
  const outputSize = num(input.crop?.outputSize);
  const bbox = Array.isArray(input.faceBbox) ? input.faceBbox.map(num) : null;
  const bboxOk = !!bbox && bbox.length === 4 && bbox.every((v) => v !== null);
  if (!cropSize || cropSize <= 0 || !outputSize || outputSize <= 0) {
    checks.geometry = false;
    return done("block", "preclip_geometry_unavailable", "crop_geometry_missing", "geometry");
  }
  if (!bboxOk) {
    checks.geometry = false;
    return done("block", "preclip_geometry_unavailable", "face_bbox_missing", "geometry");
  }
  const [x1, y1, x2, y2] = bbox as number[];
  const faceW = x2 - x1;
  const faceH = y2 - y1;
  if (!(faceW > 1) || !(faceH > 1)) {
    checks.geometry = false;
    return done("block", "preclip_geometry_unavailable", "face_bbox_degenerate", "geometry");
  }
  checks.geometry = true;
  const scale = outputSize / cropSize;
  metrics.scale_provider_per_plate = scale;

  // ── 2. face_share ≥ 0.24 (v400 T8) ───────────────────────────────────────
  const share = num(input.faceShare);
  metrics.face_share = share;
  if (share === null || share <= 0 || share > 1) {
    checks.face_share = false;
    return done("block", "preclip_face_share_invalid", "face_share_missing_or_invalid", "face_share");
  }
  if (share < V461_FACE_SHARE_FLOOR) {
    checks.face_share = false;
    return done(
      "block",
      "preclip_face_share_below_floor",
      `face_share ${share.toFixed(3)} < ${V461_FACE_SHARE_FLOOR}`,
      "face_share",
    );
  }
  checks.face_share = true;

  // ── 3. face size in PROVIDER pixels ≥ 144 (independent guard) ────────────
  const faceSizeProviderPx = Math.max(faceW, faceH) * scale;
  metrics.face_size_provider_px = faceSizeProviderPx;
  if (faceSizeProviderPx < V461_FACE_SIZE_PROVIDER_PX_FLOOR) {
    checks.face_size_px = false;
    return done(
      "block",
      "preclip_face_size_below_floor",
      `face_size_provider_px ${faceSizeProviderPx.toFixed(1)} < ${V461_FACE_SIZE_PROVIDER_PX_FLOOR}`,
      "face_size_px",
    );
  }
  checks.face_size_px = true;

  // ── 4. Mouth ROI fully inside the crop ───────────────────────────────────
  // A pure pose estimate (no signed mouth vector) is explicitly NOT a block.
  const dx = num(input.mouthOffsetXy?.dx);
  const dy = num(input.mouthOffsetXy?.dy);
  const hasMouthVector = input.anchor === "mouth" && dx !== null && dy !== null;
  if (hasMouthVector) {
    // V461 C — WHICH geometry is authoritative here.
    //
    // On a dynamic path the renderer consumed `preclip_camera_path`, while
    // `crop` + `mouthOffsetXy` describe a single static base crop and ONE
    // collapsed median mouth. Scene 67b392b1 pass 2 blocked at
    // `0.5 + 66/144 = 0.9583` although every rendered frame contained the
    // mouth: the gate was evaluating a geometry that was never rendered.
    //
    // The band derivation, its constants and the containment predicate are
    // unchanged. Only the CENTRE moves per keyframe.
    const dynamicKeyframes = input.cameraPathDynamic === true
      ? usableCameraKeyframes(input.cameraPathKeyframes)
      : [];

    if (dynamicKeyframes.length > 0) {
      // Conservative: EVERY rendered keyframe must contain the band. The
      // tightest one decides and is the one reported.
      metrics.mouth_roi_source = "camera_path";
      metrics.mouth_roi_keyframes_checked = dynamicKeyframes.length;
      let worstRoi = unclampedMouthRoiAtKeyframe(share, dynamicKeyframes[0]);
      let worstMargin = roiMargin(worstRoi);
      let worstT = dynamicKeyframes[0].t;
      for (let i = 1; i < dynamicKeyframes.length; i++) {
        const roiI = unclampedMouthRoiAtKeyframe(share, dynamicKeyframes[i]);
        const marginI = roiMargin(roiI);
        if (marginI < worstMargin) {
          worstMargin = marginI;
          worstRoi = roiI;
          worstT = dynamicKeyframes[i].t;
        }
      }
      metrics.mouth_roi = worstRoi;
      metrics.mouth_roi_checked = true;
      metrics.mouth_roi_worst_t = worstT;
      metrics.mouth_roi_worst_margin = worstMargin;
      if (!roiFullyInside(worstRoi)) {
        checks.mouth_roi = false;
        return done(
          "block",
          "preclip_mouth_roi_outside_crop",
          `mouth_roi_out_of_bounds:camera_path t=${worstT} margin=${worstMargin.toFixed(4)}`,
          "mouth_roi",
        );
      }
      checks.mouth_roi = true;
    } else {
      // Static contract — unchanged. Also the fallback whenever the path is
      // not dynamic or carries no usable keyframe.
      const roi = unclampedMouthRoi(share, { dx: dx as number, dy: dy as number }, cropSize);
      metrics.mouth_roi = roi;
      metrics.mouth_roi_checked = true;
      metrics.mouth_roi_source = "static";
      metrics.mouth_roi_worst_margin = roiMargin(roi);
      if (!roiFullyInside(roi)) {
        checks.mouth_roi = false;
        return done("block", "preclip_mouth_roi_outside_crop", "mouth_roi_out_of_bounds", "mouth_roi");
      }
      checks.mouth_roi = true;
    }
  } else {
    checks.mouth_roi = null; // unchecked — pose estimate stays allowed
  }

  // ── 5. Identity / assignment contract ────────────────────────────────────
  if (input.expectedIdentity) {
    if (!identityMatches(input.identity, input.expectedIdentity)) {
      checks.identity = false;
      return done("block", "preclip_identity_mismatch", "geometry_identity_mismatch", "identity");
    }
    checks.identity = true;
  }

  return done("pass", "face_gate_ok", "v400_input_contract_satisfied", null);
}
