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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * V519 — DYNAMIC CONTAINMENT REGIME
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Scene 67b392b1, generation 16, pass 4 (Matthew). Contract E refused the pass
 * with `target_not_contained_in_crop`, and its arithmetic was right:
 *
 *   target (turn union)  [757,339,884,525]   127 x 186
 *   applied static crop  [709,317,837,445]   128 x 128
 *
 * A 186 px tall box cannot fit a 128 px crop. But that crop was never asked to
 * hold the whole turn at once: the renderer followed a moving camera path, and
 * the planner had ALREADY proven — with `cameraPathContainsAll` — that every
 * measured face box is held by the window rendered at its own instant.
 *
 * Contract E was applying a STATIC containment rule to a DYNAMIC plan. The
 * union is the right target for a crop that never moves; for one that does, it
 * is a box nobody rendered. That is the fifth time this pipeline produced a
 * correct verdict about the wrong object.
 *
 * WHAT THIS IS NOT: a loosening. The static regime keeps zero tolerance, the
 * same identity checks and the same failure code. Dynamic mode is entered ONLY
 * on a proven path, every sample is checked against its own window, and any
 * missing, malformed or unproven evidence FAILS. Motion alone is never
 * authority.
 */

export type ContainmentRegime = "static" | "dynamic_camera_path";

export type DynamicContainmentFailure =
  | "camera_path_missing"
  | "camera_path_not_dynamic"
  | "no_track_samples"
  | "path_does_not_contain_track"
  | "target_window_pairing_failed";

export interface DynamicCameraKeyframe {
  t: number;
  x: number;
  y: number;
  size: number;
}

export interface DynamicContainmentResult {
  ok: boolean;
  regime: ContainmentRegime;
  reason?: DynamicContainmentFailure;
  /** Samples actually paired with a window and checked. */
  checked: number;
  /** The first sample that its own window did not hold. */
  failedBox?: number[] | null;
  failedT?: number | null;
  detail?: string;
}

/**
 * PURE — is a proven dynamic camera path available for this pass?
 *
 * Deliberately strict: the dynamic flag AND usable keyframes AND at least one
 * usable track sample. A moving face with no frozen path is a static pass.
 */
export function isDynamicContainmentRegime(input: {
  cameraPathDynamic?: unknown;
  keyframes?: unknown;
  trackSamples?: unknown;
}): boolean {
  if (input?.cameraPathDynamic !== true) return false;
  const kfs = Array.isArray(input?.keyframes) ? input.keyframes : [];
  const usableKf = kfs.some((k: any) =>
    k && [k?.t, k?.x, k?.y, k?.size].every((n) => Number.isFinite(Number(n))) && Number(k.size) > 0
  );
  if (!usableKf) return false;
  const samples = Array.isArray(input?.trackSamples) ? input.trackSamples : [];
  return samples.some((s: any) => {
    const raw = Array.isArray(s) ? s : s?.box;
    return Array.isArray(raw) && raw.length === 4 &&
      raw.every((n: unknown) => Number.isFinite(Number(n)));
  });
}

/**
 * PURE — Contract E for a moving crop.
 *
 * Pairs each measured face box with the window rendered at the SAME instant,
 * using the planner's own interpolation contract (`containsAll`, injected so
 * this module stays a leaf and there is exactly one interpolation model).
 *
 * `startSec` converts plate-absolute sample times to path-relative ones — the
 * keyframe clock starts at the preclip, the track clock at the plate. Getting
 * that wrong would sample the right path at the wrong moment.
 */
export function evaluateDynamicPreclipContainment(params: {
  cameraPathDynamic: unknown;
  keyframes: unknown;
  /** `{t (plate-absolute), box}` or bare boxes. */
  trackSamples: unknown;
  /** Preclip start in plate-absolute seconds. */
  startSec: number;
  /** The planner's own proof, injected: `cameraPathContainsAll`. */
  containsAll: (
    path: { keyframes?: Array<DynamicCameraKeyframe> } | null,
    samples: Array<{ t?: number | null; box?: number[] | null } | number[] | null> | null,
  ) => { ok: boolean; checked: number; failedBox: number[] | null; failedT: number | null };
}): DynamicContainmentResult {
  const fail = (
    reason: DynamicContainmentFailure,
    detail?: string,
    checked = 0,
  ): DynamicContainmentResult => ({
    ok: false,
    regime: "dynamic_camera_path",
    reason,
    checked,
    detail,
  });

  if (params?.cameraPathDynamic !== true) return fail("camera_path_not_dynamic");

  const kfsRaw = Array.isArray(params?.keyframes) ? params.keyframes : [];
  const keyframes = kfsRaw
    .filter((k: any) =>
      k && [k?.t, k?.x, k?.y, k?.size].every((n) => Number.isFinite(Number(n))) && Number(k.size) > 0
    )
    .map((k: any) => ({ t: Number(k.t), x: Number(k.x), y: Number(k.y), size: Number(k.size) }));
  if (keyframes.length === 0) return fail("camera_path_missing");

  const start = Number(params?.startSec);
  const rawSamples = Array.isArray(params?.trackSamples) ? params.trackSamples : [];
  const relSamples: Array<{ t: number | null; box: number[] }> = [];
  for (const s of rawSamples) {
    const box = Array.isArray(s) ? s : (s as any)?.box;
    if (!Array.isArray(box) || box.length !== 4) continue;
    const v = box.map((n) => Number(n));
    if (!v.every((n) => Number.isFinite(n))) continue;
    if (!(v[2] > v[0]) || !(v[3] > v[1])) continue;
    const tAbs = Array.isArray(s) ? NaN : Number((s as any)?.t);
    // Plate-absolute → path-relative. Without a usable start the pairing is
    // not provable, so the sample carries no time and must be held by some
    // window outright rather than by a guessed one.
    const t = Number.isFinite(tAbs) && Number.isFinite(start) ? tAbs - start : null;
    relSamples.push({ t, box: v });
  }
  if (relSamples.length === 0) return fail("no_track_samples");

  const held = params.containsAll({ keyframes }, relSamples);
  // `checked === 0` means nothing was actually paired: an unproven path is not
  // a proven one. The planner's helper reports ok:true in that case; here it
  // must not.
  if (held.checked === 0) {
    return fail("target_window_pairing_failed", "no sample could be paired with a window");
  }
  if (!held.ok) {
    return {
      ok: false,
      regime: "dynamic_camera_path",
      reason: "path_does_not_contain_track",
      checked: held.checked,
      failedBox: held.failedBox,
      failedT: held.failedT,
      detail: `box=[${held.failedBox?.join(",") ?? "?"}] t=${held.failedT ?? "?"}`,
    };
  }
  return { ok: true, regime: "dynamic_camera_path", checked: held.checked };
}
