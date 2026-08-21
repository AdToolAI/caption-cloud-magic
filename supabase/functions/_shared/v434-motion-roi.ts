/**
 * V434 STEP 4 — GEOMETRY-COUPLED MOUTH ROI
 * ---------------------------------------------------------------------------
 * Secondary defect from `docs/v433-motion-studio-rca.md`:
 *   the measurement ROI was a FIXED source-space band
 *   (centerX 0.5 / centerY 0.60 / 0.28 × 0.12). Because the pre-clip crop is
 *   mouth-anchored (`compute-mouth-centered-crop.ts` puts the mouth at the crop
 *   CENTER when it is not clamped), a band at y=0.60 systematically samples the
 *   nose / upper lip instead of the mouth aperture — it measures the wrong
 *   pixels and dilutes exactly the signal the gate depends on.
 *
 * This module derives the ROI from the geometry that the pre-clip renderer
 * ALREADY persists on the pass (`preclip_anchor`, `preclip_face_share`,
 * `preclip_crop.size`, `preclip_mouth_offset_px`).
 *
 * Fail-closed: whenever the geometry is missing, ambiguous, or the mouth offset
 * direction is unknown, the frozen v404 ROI is returned unchanged with an
 * explicit reason — the ROI is never guessed.
 */

export interface MouthRoiNormalized {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

/** Frozen v404 source-space ROI — the fallback, kept bit-identical. */
export const V434_LEGACY_ROI: MouthRoiNormalized = {
  centerX: 0.5,
  centerY: 0.6,
  width: 0.28,
  height: 0.12,
};

/** Mouth band proportions relative to the face side length. */
export const V434_MOUTH_BAND = {
  widthOfFaceSide: 0.62,
  heightOfFaceSide: 0.34,
  minWidth: 0.10,
  maxWidth: 0.90,
  minHeight: 0.06,
  maxHeight: 0.50,
} as const;

export interface PreclipRoiGeometry {
  /** `preclip_anchor` — only `mouth` can position a mouth ROI. */
  anchor?: string | null;
  /** `preclip_face_share` — face area / crop area, in (0, 1]. */
  faceShareInCrop?: number | null;
  /** `preclip_crop.size` — crop side length in plate pixels. */
  cropSize?: number | null;
  /** `preclip_mouth_offset_px` — UNSIGNED distance mouth ↔ crop centre. */
  mouthOffsetPx?: number | null;
  /** V434 addition — SIGNED offset in crop pixels; enables off-centre ROIs. */
  mouthOffset?: { dx: number; dy: number } | null;
}

export interface DerivedMouthRoi {
  roi: MouthRoiNormalized;
  source: "geometry" | "legacy_frozen";
  reason: string;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** PURE. Derives the normalized mouth ROI from persisted pre-clip geometry. */
export function deriveMouthRoi(geometry: PreclipRoiGeometry | null | undefined): DerivedMouthRoi {
  const legacy = (reason: string): DerivedMouthRoi => ({
    roi: { ...V434_LEGACY_ROI },
    source: "legacy_frozen",
    reason,
  });
  if (!geometry) return legacy("roi_legacy:geometry_missing");
  if (geometry.anchor !== "mouth") return legacy("roi_legacy:anchor_not_mouth");

  const share = Number(geometry.faceShareInCrop);
  if (!Number.isFinite(share) || share <= 0 || share > 1) {
    return legacy("roi_legacy:face_share_invalid");
  }

  // Mouth position inside the crop. Unclamped mouth-anchored crops put the
  // mouth exactly at the centre; a non-zero UNSIGNED offset without a signed
  // vector cannot be positioned, so we refuse to guess.
  let cx = 0.5;
  let cy = 0.5;
  const cropSize = Number(geometry.cropSize);
  const signed = geometry.mouthOffset;
  if (signed && Number.isFinite(Number(signed.dx)) && Number.isFinite(Number(signed.dy))) {
    if (!Number.isFinite(cropSize) || cropSize <= 0) return legacy("roi_legacy:crop_size_invalid");
    cx = 0.5 + Number(signed.dx) / cropSize;
    cy = 0.5 + Number(signed.dy) / cropSize;
  } else {
    const offset = Number(geometry.mouthOffsetPx ?? 0);
    if (Number.isFinite(offset) && Math.abs(offset) > 2) {
      return legacy("roi_legacy:mouth_offset_direction_unknown");
    }
  }

  const faceSideFrac = clamp(Math.sqrt(share), 0.05, 1);
  const width = clamp(
    V434_MOUTH_BAND.widthOfFaceSide * faceSideFrac,
    V434_MOUTH_BAND.minWidth,
    V434_MOUTH_BAND.maxWidth,
  );
  const height = clamp(
    V434_MOUTH_BAND.heightOfFaceSide * faceSideFrac,
    V434_MOUTH_BAND.minHeight,
    V434_MOUTH_BAND.maxHeight,
  );

  // Keep the band fully inside the frame without changing its size.
  const centerX = clamp(cx, width / 2, 1 - width / 2);
  const centerY = clamp(cy, height / 2, 1 - height / 2);

  return {
    roi: { centerX, centerY, width, height },
    source: "geometry",
    reason: "roi_geometry_coupled",
  };
}
