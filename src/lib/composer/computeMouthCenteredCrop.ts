/**
 * computeMouthCenteredCrop.ts — v247
 *
 * Given AWS Rekognition landmarks (mouth corners preferred, bbox center
 * fallback) plus the source plate dimensions, computes a square preclip
 * crop that:
 *
 *   1. Centers on the mouth (not the face-bbox center — the mouth sits
 *      lower than the geometric center of a face bbox).
 *   2. Sizes the crop so the face bbox occupies ≥ targetFaceShare of the
 *      preclip area (default 0.42 → face fills ~65% of each axis).
 *   3. Clamps to plate bounds without ever cutting the mouth off — if the
 *      requested crop cannot fit while keeping the mouth inside, the crop
 *      shrinks and re-centers on the mouth.
 *
 * Fixes the v247 "small face in plate → Sync.so no-op" failure mode where
 * the previous face-bbox-centered crop wasted resolution above the eyes.
 *
 * Pure function; no side effects; safe to unit-test in Node + Deno.
 */

export interface FaceGeometry {
  /** Pixel bbox [x1, y1, x2, y2] of the face inside the source plate. */
  bbox: [number, number, number, number];
  /** Pixel [cx, cy] of the face bbox center (fallback anchor). */
  center: [number, number];
  /** Optional mouth-center pixel [x, y] — preferred anchor when present. */
  mouth?: [number, number];
}

export interface MouthCenteredCropInput {
  face: FaceGeometry;
  plateWidth: number;
  plateHeight: number;
  /** Target ratio of face-bbox area to preclip area. Default 0.42. */
  targetFaceShare?: number;
  /** Absolute minimum crop side (pixels) — prevents micro-crops. */
  minSize?: number;
  /** Output resolution the preclip will be resampled to. Default 720. */
  outputSize?: number;
}

export interface MouthCenteredCropResult {
  /** Preclip crop rectangle on the source plate. */
  crop: { x: number; y: number; size: number; outputSize: number };
  /** Anchor used ("mouth" | "face_center"). */
  anchor: "mouth" | "face_center";
  /** Actual ratio of face bbox area to crop area after clamping. */
  faceShareInCrop: number;
  /** Distance in pixels between mouth and crop center (0 when anchor=mouth and no clamp). */
  mouthOffsetPx: number;
  /** True when clamping forced the crop away from the ideal center. */
  clamped: boolean;
}

/**
 * Compute a mouth-centered square crop for lip-sync preclip.
 *
 * Behavior:
 *   - Anchor = mouth landmark when present, else face-bbox center.
 *   - Crop side = clamp(faceBboxSide / sqrt(targetFaceShare), min, maxFit).
 *   - If anchor is inside plate but crop would spill, we shift the crop back
 *     inside the plate while keeping the mouth strictly within the crop.
 */
export function computeMouthCenteredCrop(
  input: MouthCenteredCropInput,
): MouthCenteredCropResult {
  const {
    face,
    plateWidth,
    plateHeight,
    targetFaceShare = 0.42,
    minSize = 96,
    outputSize = 720,
  } = input;

  if (plateWidth <= 0 || plateHeight <= 0) {
    throw new Error("computeMouthCenteredCrop: plate dimensions must be > 0");
  }
  if (targetFaceShare <= 0 || targetFaceShare >= 1) {
    throw new Error("computeMouthCenteredCrop: targetFaceShare must be in (0, 1)");
  }

  const [x1, y1, x2, y2] = face.bbox;
  const faceW = Math.max(1, x2 - x1);
  const faceH = Math.max(1, y2 - y1);
  const faceSide = Math.max(faceW, faceH);

  // Ideal crop side: face-bbox side / sqrt(targetFaceShare).
  // e.g. share 0.42 → side ≈ faceSide / 0.648 ≈ 1.543 × faceSide.
  const idealSide = faceSide / Math.sqrt(targetFaceShare);
  const maxSide = Math.min(plateWidth, plateHeight);
  let size = Math.round(Math.min(maxSide, Math.max(minSize, idealSide)));

  // Anchor selection: mouth preferred.
  const usingMouth =
    Array.isArray(face.mouth) &&
    Number.isFinite(face.mouth[0]) &&
    Number.isFinite(face.mouth[1]);
  const anchor: "mouth" | "face_center" = usingMouth ? "mouth" : "face_center";
  const [ax, ay] = usingMouth
    ? (face.mouth as [number, number])
    : face.center;

  // Ideal top-left so anchor is centered.
  let x = Math.round(ax - size / 2);
  let y = Math.round(ay - size / 2);

  // Clamp to plate bounds.
  const rawX = x;
  const rawY = y;
  x = Math.max(0, Math.min(plateWidth - size, x));
  y = Math.max(0, Math.min(plateHeight - size, y));

  // If mouth anchor is close to a plate edge and size exceeds available
  // room around the anchor, shrink size to keep the anchor inside.
  const maxRoomAround = Math.min(
    ax * 2,               // fit left of anchor
    (plateWidth - ax) * 2, // fit right of anchor
    ay * 2,
    (plateHeight - ay) * 2,
  );
  if (size > maxRoomAround && maxRoomAround >= minSize) {
    size = Math.round(maxRoomAround);
    x = Math.max(0, Math.min(plateWidth - size, Math.round(ax - size / 2)));
    y = Math.max(0, Math.min(plateHeight - size, Math.round(ay - size / 2)));
  }

  const clamped = x !== rawX || y !== rawY;

  // Report metrics.
  const cropArea = size * size;
  const faceArea = faceW * faceH;
  const faceShareInCrop = Math.min(1, faceArea / cropArea);
  const cropCx = x + size / 2;
  const cropCy = y + size / 2;
  const mouthOffsetPx = usingMouth
    ? Math.round(Math.hypot(ax - cropCx, ay - cropCy))
    : 0;

  return {
    crop: { x, y, size, outputSize },
    anchor,
    faceShareInCrop,
    mouthOffsetPx,
    clamped,
  };
}
