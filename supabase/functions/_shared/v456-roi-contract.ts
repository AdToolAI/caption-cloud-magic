/**
 * V456 GATE 2 — ANCHOR-COHERENT, VALIDATED MOUTH-ROI CONTRACT (PURE)
 * ---------------------------------------------------------------------------
 * Gate-1 evidence (scene be60d106…, passes 0/1/5):
 *   1. The AUTHORITATIVE motion ROI was the frozen v404 band (centerY 0.60),
 *      which on 3/4-profile speakers sits on the cheek / nose — never on the
 *      mouth. The provider smooths that texture, so `delta_mean` went NEGATIVE
 *      and the NOOP ladder terminalized a perfectly good clip.
 *   2. `preclip_bbox_measure_src` pointed at the PLATE VIDEO, although v400 T5
 *      declares the ANCHOR (`reference_image_url`) the authoritative geometry
 *      source.
 *   3. `preclip_face_share = 0` silently degraded into the legacy cheek ROI
 *      being treated as authoritative.
 *
 * This module is the ONE place that decides whether a geometry-coupled mouth
 * ROI may drive the verdict. It is PURE and has no side effects.
 *
 * HARD RULES
 *   - The geometry ROI becomes authoritative ONLY when the whole contract
 *     holds (anchor source, face bbox, mouth anchor, ROI bounds, identity).
 *   - When the contract does NOT hold the outcome is `unresolved` →
 *     `mouth_roi_unresolved`. It NEVER silently falls back to the v404 cheek
 *     ROI as an authority.
 *   - The frozen legacy ROI is kept and reported as TELEMETRY/REGRESSION
 *     evidence, so tests can show "legacy → cheek → noop" next to
 *     "geometry → mouth → correct verdict".
 *   - No threshold is read, computed or changed here (3.6827 / 15.4057 stay
 *     untouched and live in the classifier).
 */

import {
  deriveMouthRoi,
  type DerivedMouthRoi,
  type MouthRoiNormalized,
  type PreclipRoiGeometry,
  V434_LEGACY_ROI,
} from "./v434-motion-roi.ts";
import { resolveV471MouthRoi, type V471MouthRoi } from "./v471-mouth-roi.ts";

export const V456_ROI_CONTRACT_VERSION = "v456";

/** Reason prefix emitted whenever the geometry contract is not satisfied. */
export const MOUTH_ROI_UNRESOLVED = "mouth_roi_unresolved";

export type V456CheckName =
  | "anchor_source"
  | "face_bbox"
  | "face_share"
  | "mouth_anchor"
  | "roi_bounds"
  | "identity";

export interface V456Identity {
  runId?: string | null;
  generation?: number | null;
  passIdx?: number | null;
  speakerIdx?: number | null;
}

export interface V456RoiContractInput extends PreclipRoiGeometry {
  /**
   * Measurement source the pre-clip GEOMETRY was derived from. v400 T5: this
   * MUST be the anchor (`reference_image_url`), never the plate video.
   */
  geometryMeasureSrc?: string | null;
  /** `scene.reference_image_url` of the CURRENT generation. */
  expectedAnchorSrc?: string | null;
  /** `preclip_from_bbox` — the face box the crop was computed on. */
  faceBbox?: [number, number, number, number] | number[] | null;
  /** Identity the geometry was frozen with. */
  identity?: V456Identity | null;
  /** Identity of the pass being measured right now. */
  expectedIdentity?: V456Identity | null;
  /**
   * V471-B — pre-clip crop in PLATE pixels (`preclip_crop`). Supplying it (with
   * `mouthSource`) activates the authoritative V471 mouth ROI.
   */
  crop?: { x?: number | null; y?: number | null; size?: number | null } | null;
  /** V471-B — `preclip_geometry_mouth_source` (`landmark` | `pose_estimate`). */
  mouthSource?: string | null;
}

export interface V456RoiContract {
  status: "authoritative" | "unresolved";
  /** Geometry-coupled ROI — only present (and only usable) when authoritative. */
  roi: MouthRoiNormalized | null;
  /** Frozen v404 band. ALWAYS returned as regression/telemetry evidence. */
  legacyRoi: MouthRoiNormalized;
  /** Raw v434 derivation, kept for telemetry parity. */
  derived: DerivedMouthRoi;
  reason: string;
  failedCheck: V456CheckName | null;
  checks: Record<V456CheckName, boolean>;
  version: string;
  /** V471-B — the authoritative mouth ROI resolution (telemetry + authority). */
  v471?: V471MouthRoi | null;
}

const PLATE_SOURCE_HINTS = [".mp4", "hydration=", "/plates/", "plate-"];

/** PURE — strips cache-busters / hydration tags so two labels compare fairly. */
export function normalizeGeometrySource(src: string | null | undefined): string | null {
  const raw = String(src ?? "").trim();
  if (!raw) return null;
  const noTag = raw.split("#")[0].split("?")[0].trim();
  return noTag ? noTag.toLowerCase() : null;
}

/** PURE — true when the label denotes a video plate rather than a still anchor. */
export function looksLikePlateSource(src: string | null | undefined): boolean {
  const raw = String(src ?? "").toLowerCase();
  if (!raw) return false;
  return PLATE_SOURCE_HINTS.some((h) => raw.includes(h));
}

/**
 * PURE — pose-aware mouth anchor.
 *
 * Preference order (no skin/lip COLOR heuristic — it is unreliable across
 * lighting, make-up, beards, skin tones and grading):
 *   1. a real landmark from the face detector,
 *   2. a landmark from the SECOND detector (caller passes it as `landmark`),
 *   3. a pose-aware geometric estimate from the face box (yaw shifts the mouth
 *      towards the visible half of the face),
 *   4. null → the caller must emit `mouth_roi_unresolved`.
 */
export const FACE_MOUTH_Y_RATIO = 0.78;
/** Max horizontal mouth shift at |yaw| = 90°, as a fraction of the face width. */
export const POSE_MAX_X_SHIFT = 0.18;

export function resolveMouthAnchorPoseAware(input: {
  bbox?: [number, number, number, number] | number[] | null;
  landmark?: [number, number] | number[] | null;
  yawDeg?: number | null;
}): { mouth: [number, number]; source: "landmark" | "pose_estimate" } | null {
  const lm = input.landmark;
  if (Array.isArray(lm) && lm.length === 2 && Number.isFinite(Number(lm[0])) && Number.isFinite(Number(lm[1]))) {
    return { mouth: [Number(lm[0]), Number(lm[1])], source: "landmark" };
  }
  const b = input.bbox;
  if (!Array.isArray(b) || b.length !== 4 || !b.every((v) => Number.isFinite(Number(v)))) return null;
  const [x1, y1, x2, y2] = b.map(Number);
  const w = x2 - x1;
  const h = y2 - y1;
  if (!(w > 0) || !(h > 0)) return null;
  const yaw = Number.isFinite(Number(input.yawDeg)) ? Number(input.yawDeg) : 0;
  const clampedYaw = Math.max(-90, Math.min(90, yaw));
  const dx = (clampedYaw / 90) * POSE_MAX_X_SHIFT * w;
  return {
    mouth: [x1 + w / 2 + dx, y1 + h * FACE_MOUTH_Y_RATIO],
    source: "pose_estimate",
  };
}

function roiInsideBounds(roi: MouthRoiNormalized): boolean {
  const left = roi.centerX - roi.width / 2;
  const right = roi.centerX + roi.width / 2;
  const top = roi.centerY - roi.height / 2;
  const bottom = roi.centerY + roi.height / 2;
  return (
    roi.width > 0 && roi.height > 0 &&
    left >= -1e-6 && top >= -1e-6 && right <= 1 + 1e-6 && bottom <= 1 + 1e-6
  );
}

function identityMatches(a?: V456Identity | null, b?: V456Identity | null): boolean {
  if (!a || !b) return true; // nothing to compare → not a mismatch
  const cmp = (x: unknown, y: unknown) => {
    if (x === null || x === undefined || y === null || y === undefined) return true;
    return String(x) === String(y);
  };
  return (
    cmp(a.runId, b.runId) &&
    cmp(a.generation, b.generation) &&
    cmp(a.passIdx, b.passIdx) &&
    cmp(a.speakerIdx, b.speakerIdx)
  );
}

/**
 * PURE — the single authority deciding whether the geometry ROI may produce a
 * motion verdict.
 */
export function evaluateMouthRoiContract(
  input: V456RoiContractInput | null | undefined,
): V456RoiContract {
  const checks: Record<V456CheckName, boolean> = {
    anchor_source: false,
    face_bbox: false,
    face_share: false,
    mouth_anchor: false,
    roi_bounds: false,
    identity: false,
  };
  const derived = deriveMouthRoi(input ?? null);
  const fail = (check: V456CheckName, detail: string): V456RoiContract => ({
    status: "unresolved",
    roi: null,
    legacyRoi: { ...V434_LEGACY_ROI },
    derived,
    reason: `${MOUTH_ROI_UNRESOLVED}:${detail}`,
    failedCheck: check,
    checks,
    version: V456_ROI_CONTRACT_VERSION,
  });

  if (!input) return fail("anchor_source", "geometry_missing");

  // ── 1. Anchor coherence (v400 T5) ────────────────────────────────────────
  const geoSrc = normalizeGeometrySource(input.geometryMeasureSrc);
  const expectedSrc = normalizeGeometrySource(input.expectedAnchorSrc);
  if (!geoSrc) return fail("anchor_source", "geometry_measure_src_missing");
  if (looksLikePlateSource(input.geometryMeasureSrc)) {
    return fail("anchor_source", "plate_source_rejected");
  }
  if (expectedSrc && geoSrc !== expectedSrc) {
    return fail("anchor_source", "anchor_source_mismatch");
  }
  checks.anchor_source = true;

  // ── 2. Face bbox ─────────────────────────────────────────────────────────
  const bbox = input.faceBbox;
  if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every((v) => Number.isFinite(Number(v)))) {
    return fail("face_bbox", "face_bbox_missing");
  }
  const [bx1, by1, bx2, by2] = bbox.map(Number);
  if (!(bx2 - bx1 > 1) || !(by2 - by1 > 1)) return fail("face_bbox", "face_bbox_degenerate");
  checks.face_bbox = true;

  // ── 3. Face share — `0` must never degrade into the legacy cheek ROI ─────
  const share = Number(input.faceShareInCrop);
  if (!Number.isFinite(share) || share <= 0 || share > 1) {
    return fail("face_share", "face_share_invalid");
  }
  checks.face_share = true;

  // ── 4. Mouth anchor ──────────────────────────────────────────────────────
  if (input.anchor !== "mouth") return fail("mouth_anchor", "anchor_not_mouth");
  if (derived.source !== "geometry") {
    return fail("mouth_anchor", derived.reason.replace(/^roi_legacy:/, ""));
  }
  checks.mouth_anchor = true;

  // ── 5. ROI must lie fully inside the clip ────────────────────────────────
  if (!roiInsideBounds(derived.roi)) return fail("roi_bounds", "roi_out_of_bounds");
  checks.roi_bounds = true;

  // ── 6. Generation / pass / identity ──────────────────────────────────────
  if (!identityMatches(input.identity, input.expectedIdentity)) {
    return fail("identity", "identity_mismatch");
  }
  checks.identity = true;

  // ── 7. V471-B — the ONE authoritative mouth ROI ──────────────────────────
  // The V434 geometry band inherits the upstream 0.78 pose estimate and is
  // ~70–90 px too high / ~1.7× too large (docs/v471a-roi-sampling-parity.md).
  // When the V471 inputs are supplied, its ROI is the authority; when it cannot
  // place the mouth, the pass is `mouth_roi_unresolved` — never a false NOOP.
  // Activated only for passes that carry BOTH a crop and a tracked face box —
  // legacy passes without a persisted face box keep the frozen V434 behaviour
  // instead of degrading into `mouth_roi_unresolved`.
  const v471Requested = Number(input.crop?.size ?? NaN) > 0 &&
    Array.isArray(input.faceBbox) && input.faceBbox.length === 4;
  const v471 = v471Requested
    ? resolveV471MouthRoi({
      faceBbox: input.faceBbox ?? null,
      crop: input.crop ?? null,
      faceShareInCrop: input.faceShareInCrop ?? null,
      mouthOffset: input.mouthOffset ?? null,
      mouthSource: input.mouthSource ?? null,
    })
    : null;
  if (v471Requested && (!v471 || !v471.roi)) {
    return {
      ...fail("roi_bounds", (v471?.reason ?? "v471_unavailable").replace(/^v471_mouth_roi_unresolved:/, "v471_")),
      checks: { ...checks, roi_bounds: false },
      v471,
    };
  }

  return {
    status: "authoritative",
    roi: v471?.roi ? { ...v471.roi } : { ...derived.roi },
    legacyRoi: { ...V434_LEGACY_ROI },
    derived,
    reason: v471?.roi ? `roi_geometry_authoritative:${v471.reason}` : "roi_geometry_authoritative",
    failedCheck: null,
    checks,
    version: V456_ROI_CONTRACT_VERSION,
    v471,
  };
}
