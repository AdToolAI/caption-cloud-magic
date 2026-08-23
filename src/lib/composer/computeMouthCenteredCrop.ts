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
  /**
   * V457 — the padded dispatch face box [x1,y1,x2,y2] the downstream
   * fail-closed gate validates against. When present, the crop MUST
   * contain it (hard invariant, deterministic projection).
   */
  containBox?: [number, number, number, number] | null;
}

export type ContainReason =
  | "no_contain_box"
  | "already_contained"
  | "projected"
  | "contain_box_outside_plate";

/**
 * V458 — coordinate space of `mouthOffsetXy`.
 * The stored vector is `mouthPoint_plate - finalCropCenter_plate`, i.e. PLATE
 * pixels of the FINAL (post-V457) crop geometry. Consumers MUST normalize it
 * with the plate-pixel `crop.size` before using it in preclip/provider space.
 */
export const V458_MOUTH_OFFSET_SPACE = "plate" as const;

export interface MouthCenteredCropResult {
  /** Preclip crop rectangle on the source plate. */
  crop: { x: number; y: number; size: number; outputSize: number };
  /** Anchor used ("mouth" | "face_center"). */
  anchor: "mouth" | "face_center";
  /** Actual ratio of face bbox area to crop area after clamping. */
  faceShareInCrop: number;
  /** Distance in pixels between mouth and crop center (0 when anchor=mouth and no clamp). */
  mouthOffsetPx: number;
  /**
   * V458 — SIGNED mouth offset in PLATE pixels relative to the FINAL crop
   * center. May contain half-pixels — never round the components.
   * `null` when the anchor is not a trustworthy mouth landmark.
   */
  mouthOffsetXy: { dx: number; dy: number } | null;
  /** V458 — coordinate-space tag of `mouthOffsetXy` (always `plate`). */
  mouthOffsetSpace: typeof V458_MOUTH_OFFSET_SPACE;
  /** True when clamping forced the crop away from the ideal center. */
  clamped: boolean;
  /** V457 — null when no containBox was supplied. */
  containsTarget: boolean | null;
  containReason: ContainReason;
  shiftPx: { x: number; y: number };
  sizeGrown: boolean;
  sizeGrownPx: number;
}


export function normalizeContainBox(
  b?: [number, number, number, number] | null,
): [number, number, number, number] | null {
  if (!Array.isArray(b) || b.length !== 4) return null;
  if (!b.every((n) => Number.isFinite(Number(n)))) return null;
  const x1 = Math.round(Number(b[0]));
  const y1 = Math.round(Number(b[1]));
  const x2 = Math.round(Number(b[2]));
  const y2 = Math.round(Number(b[3]));
  if (x2 <= x1 || y2 <= y1) return null;
  return [x1, y1, x2, y2];
}

/**
 * V457 — deterministic interval projection: grow the square crop at most
 * once (never above the plate cap) and move it to the admissible interval
 * value closest to the mouth-centered position. No iteration, no silent
 * repair of an upstream box that cannot fit.
 */
export function projectCropToContain(
  crop: { x: number; y: number; size: number },
  box: [number, number, number, number],
  plateWidth: number,
  plateHeight: number,
): {
  crop: { x: number; y: number; size: number };
  containsTarget: boolean;
  reason: ContainReason;
  shiftPx: { x: number; y: number };
  sizeGrown: boolean;
  sizeGrownPx: number;
} {
  const baseX = Math.round(crop.x);
  const baseY = Math.round(crop.y);
  const baseSize = Math.round(crop.size);
  const fail = (reason: ContainReason) => ({
    crop: { x: baseX, y: baseY, size: baseSize },
    containsTarget: false,
    reason,
    shiftPx: { x: 0, y: 0 },
    sizeGrown: false,
    sizeGrownPx: 0,
  });

  const [bx1, by1, bx2, by2] = box;
  const bw = bx2 - bx1;
  const bh = by2 - by1;
  const cap = Math.min(plateWidth, plateHeight);
  if (bx1 < 0 || by1 < 0 || bx2 > plateWidth || by2 > plateHeight) {
    return fail("contain_box_outside_plate");
  }
  const need = Math.max(bw, bh);
  if (need > cap) return fail("contain_box_outside_plate");

  const size = Math.min(cap, Math.max(baseSize, need));
  const loX = Math.max(0, bx2 - size);
  const hiX = Math.min(bx1, plateWidth - size);
  const loY = Math.max(0, by2 - size);
  const hiY = Math.min(by1, plateHeight - size);
  if (loX > hiX || loY > hiY) return fail("contain_box_outside_plate");

  const x = Math.min(hiX, Math.max(loX, baseX));
  const y = Math.min(hiY, Math.max(loY, baseY));

  // Verify on the FINAL integer geometry (FFmpeg level), not before.
  const containsTarget =
    x >= 0 && y >= 0 &&
    x + size <= plateWidth && y + size <= plateHeight &&
    x <= bx1 && y <= by1 && x + size >= bx2 && y + size >= by2;
  if (!containsTarget) return fail("contain_box_outside_plate");

  const sizeGrownPx = Math.max(0, size - baseSize);
  const shiftPx = { x: x - baseX, y: y - baseY };
  const untouched = shiftPx.x === 0 && shiftPx.y === 0 && sizeGrownPx === 0;
  return {
    crop: { x, y, size },
    containsTarget: true,
    reason: untouched ? "already_contained" : "projected",
    shiftPx,
    sizeGrown: sizeGrownPx > 0,
    sizeGrownPx,
  };
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

  // V445 — hard lower bound: the crop must be able to CONTAIN the face bbox.
  // Without this, an anchor close to a plate edge shrank the crop below the
  // face height (production S11: face 212x281 vs. crop 272x272), which makes
  // the fail-closed containment gate arithmetically impossible to pass.
  const faceFloor = Math.min(Math.min(plateWidth, plateHeight), Math.max(faceW, faceH));
  if (size < faceFloor) {
    size = Math.round(faceFloor);
    // Re-center on the face bbox so the whole face fits, then clamp to plate.
    const faceCx = (x1 + x2) / 2;
    const faceCy = (y1 + y2) / 2;
    x = Math.max(0, Math.min(plateWidth - size, Math.round(faceCx - size / 2)));
    y = Math.max(0, Math.min(plateHeight - size, Math.round(faceCy - size / 2)));
  }

  // ── V457 — the crop MUST contain the padded dispatch box ─────────────
  let containsTarget: boolean | null = null;
  let containReason: ContainReason = "no_contain_box";
  let shiftPx = { x: 0, y: 0 };
  let sizeGrown = false;
  let sizeGrownPx = 0;
  const containBox = normalizeContainBox(input.containBox);
  if (containBox) {
    const p = projectCropToContain({ x, y, size }, containBox, plateWidth, plateHeight);
    containsTarget = p.containsTarget;
    containReason = p.reason;
    shiftPx = p.shiftPx;
    sizeGrown = p.sizeGrown;
    sizeGrownPx = p.sizeGrownPx;
    x = p.crop.x;
    y = p.crop.y;
    size = p.crop.size;
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
    containsTarget,
    containReason,
    shiftPx,
    sizeGrown,
    sizeGrownPx,
  };
}

