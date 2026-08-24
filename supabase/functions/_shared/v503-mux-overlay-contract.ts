/**
 * V503 — final-mux overlay authority.
 *
 * A completed provider pass was rendered from `preclip_url`, whose placement
 * on the master plate is defined by `preclip_crop`. `pass.coords` is an older
 * speaker-assignment point and must never invalidate that persisted transform.
 */

export type V503Crop = { x: number; y: number; size: number };

const finite = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function resolveMuxOverlayContract(input: {
  preclipCrop: unknown;
  legacyCoords?: unknown;
}): {
  crop: V503Crop | null;
  legacyCoordsInsideCrop: boolean | null;
} {
  const rawCrop = input.preclipCrop as Partial<V503Crop> | null;
  const x = finite(rawCrop?.x);
  const y = finite(rawCrop?.y);
  const size = finite(rawCrop?.size);
  if (x === null || y === null || size === null || size <= 0) {
    return { crop: null, legacyCoordsInsideCrop: null };
  }

  const crop = { x, y, size };
  const rawCoords = Array.isArray(input.legacyCoords) ? input.legacyCoords : [];
  const cx = finite(rawCoords[0]);
  const cy = finite(rawCoords[1]);
  const legacyCoordsInsideCrop = cx === null || cy === null
    ? null
    : cx >= x && cx <= x + size && cy >= y && cy <= y + size;

  return { crop, legacyCoordsInsideCrop };
}
