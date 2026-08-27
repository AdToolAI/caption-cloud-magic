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

/**
 * V522 — WHICH GEOMETRY A SUCCESS IS CARRYING.
 *
 * `static_clip_box`     one transformed box, valid for the whole pass.
 * `dynamic_per_frame`   no single box is valid, because the crop moves. The
 *                       provider authority is V464's per-frame sequence, and
 *                       a success carrying this value REQUIRES that sequence
 *                       to be built and validated before dispatch.
 *
 * Absent means `static_clip_box` — every pre-V522 result is a static one.
 */
export type ContainmentGeometryAuthority = "static_clip_box" | "dynamic_per_frame";

export interface CropContainmentResult {
  ok: boolean;
  reason?: CropContainmentFailure;
  /** Target bbox in crop-output pixel space (only when ok). */
  clipBox?: Box;
  /**
   * V522 — which geometry this result's `ok` is a statement about. A result
   * without a `clipBox` is only valid while this says `dynamic_per_frame`.
   */
  geometryAuthority?: ContainmentGeometryAuthority;
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

  // E.4 + E.3 + the clip-space box. ONE implementation, shared with the
  // dynamic regime (V521) so identity can never be checked twice, or once.
  return finalizePreclipContainment({ crop, targetBbox: [tx1, ty1, tx2, ty2], otherSpeakerCenters });
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * V521 — THE POST-CONTAINMENT FINALIZER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Scene 67b392b1, generation 18, pass 0 (Sarah). The dynamic camera path
 * proved same-time containment over 6/6 samples, the pre-clip rendered, the
 * face track was 6/6 valid — and the pass still terminalized with
 * `bbox_zero_voiced_frames` over 82 frames.
 *
 * The cause was mine, in V519. The static evaluator returns EARLY at E.1,
 * and an early return carries no `clipBox` — that field is computed only on
 * the successful path. V519 then merged a dynamic success as
 *
 *     { ...failedStaticResult, ok: true }
 *
 * which produced `ok: true` with `clipBox: undefined`. The `!` at
 * `dispatchBox = containment.clipBox!` is a compile-time assertion, not a
 * runtime value: the dispatch box became `undefined`, the canonical
 * per-frame boxes came out empty, and V152 reported zero voiced frames for a
 * speaker who was visible the whole time.
 *
 * Worse than the missing box: because E.1 returned early, E.4 (transform
 * validity) and E.3 (sibling exclusion) NEVER RAN, and the override then
 * declared success. A dynamic pass could skip the identity check.
 *
 * So the post-E.1 half of Contract E lives here, and both regimes call it:
 *
 *   STATIC   E.1 containment  → this finalizer
 *   DYNAMIC  same-time proof  → this finalizer
 *
 * A dynamic success now constructs its own COMPLETE result rather than
 * inheriting fields from a failure. `ok === true` structurally implies a
 * valid `clipBox`, because there is exactly one place that can produce it.
 */
export function finalizePreclipContainment(params: {
  crop: PreclipCrop;
  /** The authoritative target bbox in PLATE pixels. */
  targetBbox: Box;
  /** Centers of the OTHER finally assigned speakers, PLATE pixels. */
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

  // E.3 — no other assigned speaker center inside exactly this transformed
  // box. Identity, not geometry: it applies in BOTH regimes.
  //
  // V522 — the membership test itself now lives in `siblingCenterInBox`,
  // so the dynamic regime can apply the SAME rule to a per-frame box
  // without a second implementation of what "inside" means.
  const otherCentersClip: Array<[number, number]> = [];
  for (const c of otherSpeakerCenters ?? []) {
    if (!Array.isArray(c) || c.length !== 2) continue;
    if (!Number.isFinite(Number(c[0])) || !Number.isFinite(Number(c[1]))) continue;
    const ox = Math.round((Number(c[0]) - crop.x) * scale);
    const oy = Math.round((Number(c[1]) - crop.y) * scale);
    otherCentersClip.push([ox, oy]);
    if (siblingCenterInBox([ox, oy], [bx1, by1, bx2, by2])) {
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
 * V522 — CONTRACT E.3, THE ONE MEMBERSHIP RULE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Boundary-inclusive, no tolerance, identical in both regimes. It exists as
 * its own function for a single reason: the dynamic regime dispatches a
 * DIFFERENT box in every frame, and each of those boxes owes the same
 * identity proof as the static one. Two copies of "inside" would be two
 * chances to disagree — the exact shape of every referent split this
 * pipeline has produced.
 *
 * Both arguments must already be in the SAME clip space. Projecting them
 * there is the caller's job, because only the caller knows which crop was
 * rendered at that instant.
 */
export function siblingCenterInBox(center: [number, number], box: Box): boolean {
  return center[0] >= box[0] && center[0] <= box[2] &&
    center[1] >= box[1] && center[1] <= box[3];
}

/**
 * V522 — the first sibling centre that violates E.3 for `box`, or null.
 * Centres must already be projected into the same clip space as `box`.
 */
export function findSiblingCenterInBox(
  box: Box,
  centersClip: Array<[number, number]>,
): [number, number] | null {
  for (const c of centersClip ?? []) {
    if (!Array.isArray(c) || c.length !== 2) continue;
    if (!Number.isFinite(c[0]) || !Number.isFinite(c[1])) continue;
    if (siblingCenterInBox(c, box)) return [c[0], c[1]];
  }
  return null;
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
