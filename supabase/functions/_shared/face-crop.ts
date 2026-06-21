/**
 * face-crop.ts — Compute a single-face square crop from target coords +
 * optional bbox, in source-master pixel space. Used by render-dialog-turn
 * for the 3+ speaker preclip path so Sync.so only ever sees ONE face.
 *
 * The DialogStitchVideo overlays the lipsynced crop back at this exact
 * region during stitch (positioned + scaled overlay with a soft mask).
 *
 * v21 Multi-Speaker Sync.so Reliability — see plan in `.lovable/plan.md`.
 * v76 Neighbor-aware sizing — see mem/architecture/lipsync/v76-neighbor-aware-preclip.md.
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
 * Compute a square face crop centered on `coords`.
 *
 * Sizing strategy:
 *   - If a `bbox` ([x1,y1,x2,y2] in source pixels) is provided, use
 *     `max(bboxDiag * 2.0, floor)` so the crop wraps the face with ~40%
 *     padding (avoids occluding chin/forehead during head motion).
 *   - Otherwise fall back to `floor`.
 *   - Floor = `srcH * 0.55` (bbox) / `srcH * 0.6` (no bbox) for 1–2
 *     speakers; for 3+ speakers softened to `srcH * 0.35 / 0.4` so the
 *     neighbor cap below can actually take effect.
 *   - Clamp to source dimensions; if the requested center is near an edge,
 *     shift the crop so it stays fully inside the source frame.
 *
 * v76 — When `siblingCoords` (face centers of the OTHER speakers on the
 * same plate) are provided, the final crop edge is additionally clamped
 * to `max(160, 0.9 * minNeighborDistance)`. This stops 3–4 speaker
 * group-shots from producing a "single face" preclip that in reality
 * contains 2–3 faces — which made Sync.so animate the wrong face and the
 * large circular overlay cover the other characters at mux time
 * ("Character 2 speaks the whole script" symptom).
 */
export function computeFaceCrop(
  coords: [number, number],
  bbox: [number, number, number, number] | null | undefined,
  srcW: number,
  srcH: number,
  outputSize: number = 512,
  siblingCoords?: Array<[number, number]> | null,
): FaceCropRegion {
  const safeW = Math.max(2, Math.floor(srcW));
  const safeH = Math.max(2, Math.floor(srcH));
  // v129.18 — When a valid bbox is provided, derive the crop CENTER from
  // the bbox center (not from `coords`). The ASD `coords` point often
  // lands on mouth / chin / neck, so coords-centered crops with a fixed
  // 720×720 edge can clip the forehead off-frame — Sync.so then sees
  // a pullover and emits `generation_unknown_error`. Bbox-center keeps
  // the face geometrically inside the square regardless of where the
  // speaker is in the source plate.
  const hasBbox = Array.isArray(bbox) && bbox.length === 4 && bbox.every((v) => Number.isFinite(v));
  const bboxCx = hasBbox ? (Number(bbox![0]) + Number(bbox![2])) / 2 : null;
  const bboxCy = hasBbox ? (Number(bbox![1]) + Number(bbox![3])) / 2 : null;
  const cx = clampInt(
    bboxCx !== null ? bboxCx : (coords?.[0] ?? safeW / 2),
    0,
    safeW,
  );
  const cy = clampInt(
    bboxCy !== null ? bboxCy : (coords?.[1] ?? safeH / 2),
    0,
    safeH,
  );

  // ── Neighbor distance (v76) ───────────────────────────────────────
  const sibs = Array.isArray(siblingCoords)
    ? siblingCoords.filter(
        (c) =>
          Array.isArray(c) &&
          c.length === 2 &&
          Number.isFinite(Number(c[0])) &&
          Number.isFinite(Number(c[1])),
      )
    : [];
  let minNeighborDist = Infinity;
  for (const c of sibs) {
    const dx = Number(c[0]) - cx;
    const dy = Number(c[1]) - cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > 0 && d < minNeighborDist) minNeighborDist = d;
  }
  const hasNeighbors = Number.isFinite(minNeighborDist);
  // For 3+ speakers (≥2 siblings) the floor is softened so the cap can
  // actually shrink the crop below ~half the frame height.
  const tightFloor = sibs.length >= 2;

  let rawSize: number;
  if (hasBbox) {
    // v129.18 — size based on the LARGER bbox axis (not diagonal) ×2.0.
    // Diagonal-based sizing under-cropped tall portrait bboxes; max-axis
    // guarantees both axes have ≥50 % padding (forehead + chin headroom).
    const bw = Math.abs(Number(bbox![2]) - Number(bbox![0]));
    const bh = Math.abs(Number(bbox![3]) - Number(bbox![1]));
    const maxAxis = Math.max(bw, bh);
    const floor = tightFloor ? safeH * 0.35 : safeH * 0.55;
    rawSize = Math.max(maxAxis * 2.0, floor);
  } else {
    rawSize = tightFloor ? safeH * 0.4 : safeH * 0.6;
  }

  // Clamp size to fit within source bounds (square must fully fit).
  let size = Math.min(rawSize, safeW, safeH);
  // v76 — Neighbor cap: keep the crop comfortably narrower than the gap
  // to the closest other speaker so we never include their face.
  // v92 — Floor bumped from 160 → 220 (and 0.9 → 0.88 of neighbor gap).
  // At 160 the 4-speaker preclips ended up at exactly 160px crops scaled
  // 3.2× to 512, giving Sync.so's `auto_detect` very little facial detail
  // — the LAST speaker (Sarah) returned essentially un-animated lips in
  // DB-confirmed scene 63fc42c2 (YAVG frame diff 1.1 vs 17 for centered
  // speakers). 220 lifts the floor by ~38 % more facial pixels without
  // breaking the neighbor guarantee: 0.88 × typical 170 px neighbor gap
  // = 149.6 — we keep the larger of (220, 0.88 × gap) so single-shot and
  // wide-gap layouts get even more context, while truly tight groups
  // (gap < 250 px) stay at the gap-derived cap.
  if (hasNeighbors) {
    const maxAllowed = Math.max(220, 0.88 * minNeighborDist);
    size = Math.min(size, maxAllowed);
  } else {
    size = Math.max(size, 220);
  }
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
