/**
 * V471-B — ONE AUTHORITATIVE MOUTH ROI (VERDICT SIDE ONLY, PURE)
 * ---------------------------------------------------------------------------
 * Evidence: `docs/v471a-roi-sampling-parity.md`.
 *
 * Face tracking is healthy (V464: per-frame boxes, mouth 12/12 inside the ASD
 * box). What is broken is the DERIVATION of the mouth position inside that
 * tracked face:
 *
 *   - every S01 pass carries `preclip_geometry_mouth_source = "pose_estimate"`,
 *     i.e. the mouth was placed at `FACE_MOUTH_Y_RATIO = 0.78` of the face box,
 *   - the pixel-wise edit map proves the really edited mouth band sits at
 *     ≈ 0.88 of the face box (preclip `cy ≈ 0.61`, production ROI `cy 0.5426`),
 *   - the derived band is additionally ~1.7× too large (95k vs 55k ROI pixels,
 *     IoU 0.39), diluting the numerator with nose / cheek / static skin.
 *
 * Consequence: P1 measured 1.81 (NOOP → terminal) instead of 2.34–2.41
 * (INDETERMINATE → `motion_unverified`). A false NOOP produced by the
 * MEASUREMENT REGION, not by the provider.
 *
 * Contract implemented here (approved scope):
 *   1. LANDMARK FIRST — when the persisted geometry came from a real mouth
 *      landmark, its position is used unchanged.
 *   2. FACE-RATIO FALLBACK — otherwise the mouth is re-derived from the tracked
 *      face box with the calibrated ratio `V471_FACE_MOUTH_Y_RATIO`.
 *   3. TIGHTENED BAND — mouth-band proportions calibrated against the edit map.
 *   4. VERDICT ONLY — nothing here touches dispatch, pre-clip rendering or ASD.
 *
 * PURE: no I/O, no thresholds, no side effects.
 */

import type { MouthRoiNormalized } from "./v434-motion-roi.ts";

export const V471_MOUTH_ROI_VERSION = "v471b+v477";

/**
 * V477 — the compensatory ratio 0.88 is GONE.
 *
 * V476 (`docs/v476-t8-conformance-measurement.md`) proved that 0.88 was not a
 * geometric truth but a compensation for a broken data source: the pre-clip
 * geometry always ran on the 0.78 pose estimate because the measured mouth
 * landmarks (real ratio 0.734–0.781) were produced after the crop and thrown
 * away. With V477 the tracked landmark is authoritative, so this module keeps
 * exactly ONE fallback — the same validated ratio the geometry side uses
 * (`FACE_MOUTH_Y_RATIO` in `v456-roi-contract.ts`, asserted equal in the
 * tests; duplicated as a literal here only to avoid an import cycle) — and
 * only for passes that carry no landmark at all.
 */
export const V471_FACE_MOUTH_Y_RATIO = 0.78;



/**
 * Mouth band relative to the face side length in the crop. Calibrated so that
 * a typical S01 pass (`face_share ≈ 0.277` → face side ≈ 0.526) yields
 * ≈ 0.28 × 0.12 — the band the V471-A edit map showed to be mouth-centred.
 */
export const V471_MOUTH_BAND = {
  widthOfFaceSide: 0.53,
  heightOfFaceSide: 0.23,
  minWidth: 0.08,
  maxWidth: 0.90,
  minHeight: 0.05,
  maxHeight: 0.50,
} as const;

export type V471MouthAnchorSource = "landmark" | "face_ratio" | "unresolved";

export interface V471RoiInput {
  /** Face box the pre-clip crop was computed on, in PLATE pixels. */
  faceBbox?: [number, number, number, number] | number[] | null;
  /** Pre-clip crop in PLATE pixels (`preclip_crop`). */
  crop?: { x?: number | null; y?: number | null; size?: number | null } | null;
  /** `preclip_face_share` — face area / crop area, in (0, 1]. */
  faceShareInCrop?: number | null;
  /** `preclip_mouth_offset_xy` — SIGNED plate-pixel vector to the crop centre. */
  mouthOffset?: { dx?: number | null; dy?: number | null } | null;
  /**
   * `preclip_geometry_mouth_source` — only `"landmark"` is trusted as a real
   * mouth observation; `"pose_estimate"` (or null) triggers the calibrated
   * face-ratio fallback.
   */
  mouthSource?: string | null;
}

export interface V471MouthRoi {
  roi: MouthRoiNormalized | null;
  anchorSource: V471MouthAnchorSource;
  /** Normalised mouth centre inside the pre-clip, for telemetry. */
  center: { cx: number; cy: number } | null;
  reason: string;
  version: string;
}

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function bandFor(share: number): { width: number; height: number } {
  const faceSideFrac = clamp(Math.sqrt(share), 0.05, 1);
  return {
    width: clamp(
      V471_MOUTH_BAND.widthOfFaceSide * faceSideFrac,
      V471_MOUTH_BAND.minWidth,
      V471_MOUTH_BAND.maxWidth,
    ),
    height: clamp(
      V471_MOUTH_BAND.heightOfFaceSide * faceSideFrac,
      V471_MOUTH_BAND.minHeight,
      V471_MOUTH_BAND.maxHeight,
    ),
  };
}

const unresolved = (reason: string): V471MouthRoi => ({
  roi: null,
  anchorSource: "unresolved",
  center: null,
  reason: `v471_mouth_roi_unresolved:${reason}`,
  version: V471_MOUTH_ROI_VERSION,
});

/**
 * PURE — the single authoritative mouth ROI used by the motion verdict.
 * Returns `unresolved` whenever the geometry cannot place the mouth; callers
 * must then treat the pass as `mouth_roi_unresolved` and never guess.
 */
export function resolveV471MouthRoi(input: V471RoiInput | null | undefined): V471MouthRoi {
  if (!input) return unresolved("input_missing");

  const cropSize = num(input.crop?.size);
  const cropY = num(input.crop?.y);
  const cropX = num(input.crop?.x);
  if (cropSize === null || cropSize <= 0) return unresolved("crop_size_invalid");

  const share = num(input.faceShareInCrop);
  if (share === null || share <= 0 || share > 1) return unresolved("face_share_invalid");

  const dx = num(input.mouthOffset?.dx);
  const dy = num(input.mouthOffset?.dy);

  let cx: number | null = null;
  let cy: number | null = null;
  let anchorSource: V471MouthAnchorSource = "unresolved";

  // ── 1. Landmark first ────────────────────────────────────────────────────
  if (String(input.mouthSource ?? "").toLowerCase() === "landmark" && dx !== null && dy !== null) {
    cx = 0.5 + dx / cropSize;
    cy = 0.5 + dy / cropSize;
    anchorSource = "landmark";
  } else {
    // ── 2. Calibrated face-ratio fallback ─────────────────────────────────
    const b = input.faceBbox;
    if (!Array.isArray(b) || b.length !== 4 || !b.every((v) => num(v) !== null)) {
      return unresolved("face_bbox_missing");
    }
    const [x1, y1, x2, y2] = b.map(Number);
    const fw = x2 - x1;
    const fh = y2 - y1;
    if (!(fw > 1) || !(fh > 1)) return unresolved("face_bbox_degenerate");
    if (cropX === null || cropY === null) return unresolved("crop_origin_missing");

    // Horizontal: keep the observed (pose-aware) mouth x when available, since
    // yaw shifts the mouth sideways and the edit map confirmed x is accurate.
    const mouthXPlate = dx !== null ? cropX + cropSize / 2 + dx : x1 + fw / 2;
    const mouthYPlate = y1 + fh * V471_FACE_MOUTH_Y_RATIO;
    cx = (mouthXPlate - cropX) / cropSize;
    cy = (mouthYPlate - cropY) / cropSize;
    anchorSource = "face_ratio";
  }

  if (cx === null || cy === null || !Number.isFinite(cx) || !Number.isFinite(cy)) {
    return unresolved("mouth_centre_not_finite");
  }
  if (cx < 0 || cx > 1 || cy < 0 || cy > 1) return unresolved("mouth_centre_outside_preclip");

  const { width, height } = bandFor(share);
  const roi: MouthRoiNormalized = {
    centerX: clamp(cx, width / 2, 1 - width / 2),
    centerY: clamp(cy, height / 2, 1 - height / 2),
    width,
    height,
  };

  return {
    roi,
    anchorSource,
    center: { cx, cy },
    reason: anchorSource === "landmark"
      ? "v471_mouth_roi:landmark"
      : "v471_mouth_roi:face_ratio_calibrated",
    version: V471_MOUTH_ROI_VERSION,
  };
}
