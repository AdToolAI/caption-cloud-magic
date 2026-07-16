/**
 * compute-mouth-centered-crop.ts (Deno port, v247)
 *
 * 1:1 mirror of src/lib/composer/computeMouthCenteredCrop.ts kept as a
 * separate file so the edge-function bundler doesn't need to reach into
 * the React `src/` tree. Any change to the Node util MUST be mirrored
 * here and vice versa. Unit tests live next to the Node source; Deno
 * sanity tests live next to this file.
 *
 * Purpose: compute a square preclip crop centered on the mouth landmark
 * (falls back to face-bbox center) that guarantees face-share ≥ ~42%
 * of the preclip area so Sync.so doesn't silently no-op on tiny faces.
 */

export interface FaceGeometry {
  bbox: [number, number, number, number];
  center: [number, number];
  mouth?: [number, number];
}

export interface MouthCenteredCropInput {
  face: FaceGeometry;
  plateWidth: number;
  plateHeight: number;
  targetFaceShare?: number;
  minSize?: number;
  outputSize?: number;
}

export interface MouthCenteredCropResult {
  crop: { x: number; y: number; size: number; outputSize: number };
  anchor: "mouth" | "face_center";
  faceShareInCrop: number;
  mouthOffsetPx: number;
  clamped: boolean;
}

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

  const idealSide = faceSide / Math.sqrt(targetFaceShare);
  const maxSide = Math.min(plateWidth, plateHeight);
  let size = Math.round(Math.min(maxSide, Math.max(minSize, idealSide)));

  const usingMouth =
    Array.isArray(face.mouth) &&
    Number.isFinite(face.mouth[0]) &&
    Number.isFinite(face.mouth[1]);
  const anchor: "mouth" | "face_center" = usingMouth ? "mouth" : "face_center";
  const [ax, ay] = usingMouth
    ? (face.mouth as [number, number])
    : face.center;

  let x = Math.round(ax - size / 2);
  let y = Math.round(ay - size / 2);

  const rawX = x;
  const rawY = y;
  x = Math.max(0, Math.min(plateWidth - size, x));
  y = Math.max(0, Math.min(plateHeight - size, y));

  const maxRoomAround = Math.min(
    ax * 2,
    (plateWidth - ax) * 2,
    ay * 2,
    (plateHeight - ay) * 2,
  );
  if (size > maxRoomAround && maxRoomAround >= minSize) {
    size = Math.round(maxRoomAround);
    x = Math.max(0, Math.min(plateWidth - size, Math.round(ax - size / 2)));
    y = Math.max(0, Math.min(plateHeight - size, Math.round(ay - size / 2)));
  }

  const clamped = x !== rawX || y !== rawY;

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
