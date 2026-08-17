/**
 * preclip-crop-containment.ts (FA-4 Face-Candidate Fix, Contract E)
 *
 * Deterministic, vision-free proof that the preclip crop targets exactly the
 * assigned speaker before anything is dispatched to Sync.so.
 *
 * Checks (all mandatory, no padding, no new tolerance):
 *   E.1 the full final target bbox lies inside the preclip crop (plate space)
 *   E.4 the plate→crop transform of that bbox is bounds-valid + non-degenerate
 *   E.3 no center of ANY OTHER finally assigned speaker bbox lies inside the
 *       transformed target bbox (checked in crop space against exactly that box)
 *
 * The transformed box returned here is the box that MUST be written to
 * `bounding_boxes_url` (E.5).
 */

export interface PreclipCrop { x: number; y: number; size: number; outputSize: number }
export type Box = [number, number, number, number];

export type CropContainmentFailure =
  | "invalid_crop"
  | "invalid_target_bbox"
  | "target_not_contained_in_crop"
  | "transform_out_of_bounds"
  | "transform_degenerate"
  | "other_speaker_center_in_target";

export interface CropContainmentResult {
  ok: boolean;
  reason?: CropContainmentFailure;
  /** Target bbox in crop-output pixel space (only when ok). */
  clipBox?: Box;
  /** Diagnostics: crop-space centers of the other assigned speakers. */
  otherCentersClip?: Array<[number, number]>;
  detail?: string;
}

const isFiniteBox = (b: unknown): b is Box =>
  Array.isArray(b) && b.length === 4 && b.every((n) => Number.isFinite(Number(n)));

export function evaluatePreclipCropContainment(params: {
  crop: PreclipCrop;
  /** Final assigned target bbox of THIS speaker, plate pixel space. */
  targetBbox: Box;
  /** Centers of the OTHER finally assigned speakers, plate pixel space. */
  otherSpeakerCenters: Array<[number, number]>;
}): CropContainmentResult {
  const { crop, targetBbox, otherSpeakerCenters } = params;
  if (
    !crop ||
    !Number.isFinite(crop.x) || !Number.isFinite(crop.y) ||
    !Number.isFinite(crop.size) || !Number.isFinite(crop.outputSize) ||
    crop.size <= 0 || crop.outputSize <= 0
  ) {
    return { ok: false, reason: "invalid_crop" };
  }
  if (!isFiniteBox(targetBbox)) return { ok: false, reason: "invalid_target_bbox" };

  const [tx1, ty1, tx2, ty2] = targetBbox.map(Number) as Box;
  if (tx2 <= tx1 || ty2 <= ty1) return { ok: false, reason: "invalid_target_bbox" };

  // E.1 — full containment in plate space, no padding.
  const cx1 = crop.x;
  const cy1 = crop.y;
  const cx2 = crop.x + crop.size;
  const cy2 = crop.y + crop.size;
  if (tx1 < cx1 || ty1 < cy1 || tx2 > cx2 || ty2 > cy2) {
    return {
      ok: false,
      reason: "target_not_contained_in_crop",
      detail: `target=[${tx1},${ty1},${tx2},${ty2}] crop=[${cx1},${cy1},${cx2},${cy2}]`,
    };
  }

  // E.4 — deterministic plate → crop-output transform.
  const scale = crop.outputSize / crop.size;
  const bx1 = Math.round((tx1 - crop.x) * scale);
  const by1 = Math.round((ty1 - crop.y) * scale);
  const bx2 = Math.round((tx2 - crop.x) * scale);
  const by2 = Math.round((ty2 - crop.y) * scale);
  if (bx2 <= bx1 || by2 <= by1) return { ok: false, reason: "transform_degenerate" };
  if (bx1 < 0 || by1 < 0 || bx2 > crop.outputSize || by2 > crop.outputSize) {
    return {
      ok: false,
      reason: "transform_out_of_bounds",
      detail: `clip_box=[${bx1},${by1},${bx2},${by2}] out=${crop.outputSize}`,
    };
  }

  // E.3 — no other assigned speaker center inside exactly this transformed box.
  const otherCentersClip: Array<[number, number]> = [];
  for (const c of otherSpeakerCenters ?? []) {
    if (!Array.isArray(c) || c.length !== 2) continue;
    if (!Number.isFinite(Number(c[0])) || !Number.isFinite(Number(c[1]))) continue;
    const ox = Math.round((Number(c[0]) - crop.x) * scale);
    const oy = Math.round((Number(c[1]) - crop.y) * scale);
    otherCentersClip.push([ox, oy]);
    if (ox >= bx1 && ox <= bx2 && oy >= by1 && oy <= by2) {
      return {
        ok: false,
        reason: "other_speaker_center_in_target",
        otherCentersClip,
        detail: `other_center_clip=[${ox},${oy}] target_clip=[${bx1},${by1},${bx2},${by2}]`,
      };
    }
  }

  return { ok: true, clipBox: [bx1, by1, bx2, by2], otherCentersClip };
}
