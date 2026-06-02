/**
 * face-crop.ts — Compute a single-face square crop from target coords +
 * optional bbox, in source-master pixel space. Used by render-dialog-turn
 * for the 3+ speaker preclip path so Sync.so only ever sees ONE face.
 *
 * The DialogStitchVideo overlays the lipsynced crop back at this exact
 * region during stitch (positioned + scaled overlay with a soft mask).
 *
 * v21 Multi-Speaker Sync.so Reliability — see plan in `.lovable/plan.md`.
 */

export interface FaceCropRegion {
  /** Crop top-left X in source-master pixel space, even-snapped. */
  x: number;
  /** Crop top-left Y in source-master pixel space, even-snapped. */
  y: number;
  /** Square edge length in source pixels, even-snapped. */
  size: number;
  /** Output square edge for the preclip (default 512, even-snapped). */
  outputSize: number;
}

function clampInt(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function evenSnap(n: number): number {
  const r = Math.round(n);
  return r % 2 === 0 ? r : r - 1;
}

/**
 * Compute a square face crop centered on `coords`, sized to comfortably
 * include the head + shoulders. Snaps to even pixel boundaries (h264 mod-2).
 *
 * Sizing strategy:
 *   - If a `bbox` ([x1,y1,x2,y2] in source pixels) is provided, use
 *     `max(bboxDiag * 2.0, srcH * 0.55)` so the crop wraps the face with
 *     ~40% padding (avoids occluding chin/forehead during head motion).
 *   - Otherwise fall back to `srcH * 0.6`.
 *   - Clamp to source dimensions; if the requested center is near an edge,
 *     shift the crop so it stays fully inside the source frame.
 */
export function computeFaceCrop(
  coords: [number, number],
  bbox: [number, number, number, number] | null | undefined,
  srcW: number,
  srcH: number,
  outputSize: number = 512,
): FaceCropRegion {
  const safeW = Math.max(2, Math.floor(srcW));
  const safeH = Math.max(2, Math.floor(srcH));
  const cx = clampInt(coords?.[0] ?? safeW / 2, 0, safeW);
  const cy = clampInt(coords?.[1] ?? safeH / 2, 0, safeH);

  let rawSize: number;
  if (Array.isArray(bbox) && bbox.length === 4 && bbox.every((v) => Number.isFinite(v))) {
    const bw = Math.abs(Number(bbox[2]) - Number(bbox[0]));
    const bh = Math.abs(Number(bbox[3]) - Number(bbox[1]));
    const diag = Math.sqrt(bw * bw + bh * bh);
    rawSize = Math.max(diag * 2.0, safeH * 0.55);
  } else {
    rawSize = safeH * 0.6;
  }

  // Clamp size to fit within source bounds (square must fully fit).
  let size = Math.min(rawSize, safeW, safeH);
  size = evenSnap(Math.max(64, size));

  // Position so the crop fully fits, biased toward `coords` center.
  let x = Math.round(cx - size / 2);
  let y = Math.round(cy - size / 2);
  x = clampInt(x, 0, safeW - size);
  y = clampInt(y, 0, safeH - size);
  x = evenSnap(x);
  y = evenSnap(y);

  const outEven = evenSnap(Math.max(64, outputSize));
  return { x, y, size, outputSize: outEven };
}
