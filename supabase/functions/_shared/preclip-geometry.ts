import type { FaceCropRegion } from "./face-crop.ts";

export type FaceBox = [number, number, number, number];
export type FacePoint = [number, number];

function validBox(value: unknown): value is FaceBox {
  return Array.isArray(value) && value.length === 4 && value.every((n) => Number.isFinite(Number(n))) &&
    Number(value[2]) > Number(value[0]) && Number(value[3]) > Number(value[1]);
}

function validPoint(value: unknown): value is FacePoint {
  return Array.isArray(value) && value.length === 2 && value.every((n) => Number.isFinite(Number(n)));
}

export function faceShareForCrop(
  bbox: FaceBox | null | undefined,
  cropSize: number,
): number | null {
  if (!validBox(bbox) || !Number.isFinite(cropSize) || cropSize <= 0) return null;
  const area = (Number(bbox[2]) - Number(bbox[0])) * (Number(bbox[3]) - Number(bbox[1]));
  return Math.min(1, area / (cropSize * cropSize));
}

/**
 * v335 — Keep a bbox-based legacy crop above the same face-share floor used
 * by the dispatcher. The old path could create a 394px crop around a 55px
 * face and then either report share=0 or fail the gate with a guaranteed no-op.
 */
export function capCropToFaceShare(params: {
  crop: FaceCropRegion;
  bbox: FaceBox | null | undefined;
  floor: number;
  plateWidth: number;
  plateHeight: number;
}): { crop: FaceCropRegion; faceShare: number | null; capped: boolean } {
  const { crop, bbox } = params;
  const floor = Number(params.floor);
  const initialShare = faceShareForCrop(bbox, crop.size);
  if (!validBox(bbox) || initialShare === null || !Number.isFinite(floor) || floor <= 0 || initialShare >= floor) {
    return { crop, faceShare: initialShare, capped: false };
  }

  const bw = Number(bbox[2]) - Number(bbox[0]);
  const bh = Number(bbox[3]) - Number(bbox[1]);
  const faceArea = bw * bh;
  const shareCap = Math.floor(Math.sqrt(faceArea / floor));
  const minToContainFace = Math.ceil(Math.max(bw, bh) + 8);

  // An extremely thin/malformed box cannot both fit and satisfy the floor.
  // Leave it unchanged so the caller's existing fail-closed gate rejects it.
  if (shareCap < minToContainFace) {
    return { crop, faceShare: initialShare, capped: false };
  }

  const bounded = Math.min(crop.size, shareCap, params.plateWidth, params.plateHeight);
  const size = Math.max(64, bounded % 2 === 0 ? bounded : bounded - 1);
  const cx = (Number(bbox[0]) + Number(bbox[2])) / 2;
  const cy = (Number(bbox[1]) + Number(bbox[3])) / 2;
  let x = Math.max(0, Math.min(params.plateWidth - size, Math.round(cx - size / 2)));
  let y = Math.max(0, Math.min(params.plateHeight - size, Math.round(cy - size / 2)));
  x = x % 2 === 0 ? x : Math.max(0, x - 1);
  y = y % 2 === 0 ? y : Math.max(0, y - 1);
  const next = { ...crop, x, y, size };
  return { crop: next, faceShare: faceShareForCrop(bbox, size), capped: size !== crop.size || x !== crop.x || y !== crop.y };
}

/** Prefer current plate geometry; speaker coords are only a legacy fallback. */
export function collectSiblingFaceCenters(
  targetSpeakerIdx: number,
  plateBoxes: Array<FaceBox | null | undefined>,
  fallbackCoords: Array<FacePoint | null | undefined>,
): FacePoint[] {
  const count = Math.max(plateBoxes.length, fallbackCoords.length);
  const result: FacePoint[] = [];
  for (let i = 0; i < count; i++) {
    if (i === targetSpeakerIdx) continue;
    const box = plateBoxes[i];
    if (validBox(box)) {
      result.push([(Number(box[0]) + Number(box[2])) / 2, (Number(box[1]) + Number(box[3])) / 2]);
      continue;
    }
    const fallback = fallbackCoords[i];
    if (validPoint(fallback)) result.push([Number(fallback[0]), Number(fallback[1])]);
  }
  return result;
}