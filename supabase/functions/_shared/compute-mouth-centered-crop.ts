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
  /**
   * V457 — the padded dispatch face box [x1,y1,x2,y2] the downstream
   * fail-closed gate validates against. When present, the crop MUST
   * contain it (hard invariant, deterministic projection).
   */
  containBox?: [number, number, number, number] | null;
  /**
   * V461 D — the downstream face-share floor this crop must be able to
   * satisfy (`V461_FACE_SHARE_FLOOR`).
   *
   * Passed IN rather than imported so this module stays a pure leaf with
   * no dependencies, and so the value has exactly ONE definition — in the
   * gate that enforces it. Two independently maintained copies of 0.24 is
   * the failure mode this parameter exists to avoid.
   *
   * `null`/omitted keeps the historical behaviour: no upper bound.
   */
  faceShareFloor?: number | null;
  /**
   * V461 E — smallest crop side that can hold the face at ANY SINGLE
   * sample of the turn, already expressed in the camera planner's own
   * containment contract.
   *
   * Supplying it switches the feasibility model from STATIC to DYNAMIC:
   * a moving crop never has to contain the whole time-union at once, so
   * the union is not a valid lower bound for it. Production 67b392b1 run
   * 811da925 pass 0 was refused at `min_crop_243px` derived from a
   * 157x221 union while every individual box needed only ~171 px and the
   * cap allowed 235.
   *
   * The caller derives this with the planner's `CONTAINMENT_PAD_RATIO` so
   * the number has one authority. `null`/omitted keeps the static model.
   */
  perFrameMinCropPx?: number | null;
  /**
   * V520 — the face-share cap derived from the SAME turn-track samples
   * that produced `perFrameMinCropPx`.
   *
   * Generation 17, Sarah: the lower bound came from a ~247 px track
   * sample (269 px required) and the upper from the 87x124 assignment
   * snapshot (212 px cap). `269 > 212` compared an anchor-scale face
   * against a track-scale one and refused a pass whose own other turn in
   * the same generation planned a 191 px crop and was dispatched.
   *
   * Supplying this makes the dynamic interval single-authority: both ends
   * are measured on the same samples. `null` keeps the historical
   * behaviour, which is also what the static regime uses.
   */
  dynamicShareCapPx?: number | null;
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
  crop: { x: number; y: number; size: number; outputSize: number };
  anchor: "mouth" | "face_center";
  faceShareInCrop: number;
  mouthOffsetPx: number;
  /**
   * V458 — SIGNED mouth offset in PLATE pixels relative to the FINAL crop
   * center. May contain half-pixels (odd crop sizes) — never round the
   * components. `null` when the anchor is not a trustworthy mouth landmark.
   */
  mouthOffsetXy: { dx: number; dy: number } | null;
  /** V458 — coordinate-space tag of `mouthOffsetXy` (always `plate`). */
  mouthOffsetSpace: typeof V458_MOUTH_OFFSET_SPACE;
  clamped: boolean;
  /**
   * V457 — does the FINAL APPLIED crop contain the contain box?
   *
   * V519: this used to be copied from `projectCropToContain`, which
   * answers about the crop the projection WOULD have produced. In dynamic
   * mode a projection that requires growth is deliberately discarded, and
   * the flag then described a crop that was never rendered. Generation 16,
   * Matthew: target 127x186, applied crop 128x128, `containsTarget = true`.
   *
   * It is now computed on the final geometry, always. `null` only when no
   * containBox was supplied.
   */
  containsTarget: boolean | null;
  /** V519 — the projection was actually applied to the returned crop. */
  projectionApplied: boolean;
  /** V519 — the projection was computed and then deliberately discarded. */
  projectionDiscarded: boolean;
  /** V519 — the projection could only succeed by growing the crop. */
  projectionRequiredGrowth: boolean;
  containReason: ContainReason;
  shiftPx: { x: number; y: number };
  sizeGrown: boolean;
  sizeGrownPx: number;

  // ── V461 D — the feasible crop interval, reported explicitly ────────
  /**
   * Largest crop side whose area still lets the face reach the downstream
   * share floor: `sqrt(faceW * faceH / faceShareFloor)`.
   * `null` when no floor was supplied.
   */
  maxCropByFaceShare: number | null;
  /**
   * Smallest crop side that can still hold the geometry: the face bbox and,
   * when supplied, the padded contain box.
   */
  minCropRequiredPx: number;
  /**
   * `false` when `minCropRequiredPx > maxCropByFaceShare`, i.e. no crop can
   * satisfy containment AND the share floor at the same time. The caller
   * must then refuse to render rather than produce a doomed pre-clip.
   */
  feasible: boolean;
  /** Named reason when `feasible` is false. */
  infeasibleReason: string | null;
  /** True when the preferred `minSize` floor yielded to the share cap. */
  preferredFloorYielded: boolean;
  /** Which feasibility model decided the lower bound. */
  feasibilityMode: "static" | "dynamic";
  /** V520 — which measurement produced the face-share cap that decided. */
  shareCapAuthority: "anchor_snapshot" | "turn_track";
  /** V520 — the cap actually used by the feasibility verdict. */
  effectiveShareCapPx: number | null;
  /** Union-based lower bound. Reported in BOTH modes, authoritative only in static. */
  minCropStaticPx: number;
  /** Per-sample lower bound. `null` when the caller supplied no turn geometry. */
  minCropDynamicPx: number | null;
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
    faceShareFloor = null,
    perFrameMinCropPx = null,
    dynamicShareCapPx = null,
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

  // ── V461 D — the crop must be able to satisfy the downstream contract ─
  //
  // Production 67b392b1 run 3255bfe3 pass 2: face 46x61 = 2806 px^2. The
  // planner asked for 94 px (share 0.318). `minCropSizePx = 128` overrode
  // it, and the gate then measured 2806/128^2 = 0.171 against the crop the
  // floor had imposed. The largest crop that can reach 0.24 is 108, so the
  // feasible interval was empty and no planner choice could have helped.
  //
  // 128 stays the PREFERRED floor. It yields — per pass, never globally —
  // exactly when honouring it would make the pass arithmetically
  // impossible.
  const faceArea = faceW * faceH;
  const shareFloor = Number(faceShareFloor);
  const maxCropByFaceShare = Number.isFinite(shareFloor) && shareFloor > 0
    ? Math.sqrt(faceArea / shareFloor)
    : null;
  const shareCap = maxCropByFaceShare === null ? null : Math.floor(maxCropByFaceShare);
  const effectiveMinSize = shareCap === null ? minSize : Math.min(minSize, shareCap);
  const preferredFloorYielded = effectiveMinSize < minSize;

  let size = Math.round(Math.min(maxSide, Math.max(effectiveMinSize, idealSide)));
  // V461 E — a moving crop must still hold the face at every single sample.
  const perFrameFloor = Number(perFrameMinCropPx);
  if (Number.isFinite(perFrameFloor) && perFrameFloor > 0) {
    size = Math.max(size, Math.ceil(perFrameFloor));
  }
  // A face large enough that `idealSide` alone overshoots the cap.
  if (shareCap !== null && size > shareCap) size = shareCap;

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

  // ── V461 E — which feasibility model applies to THIS render ──────────
  //
  // A moving crop is not required to contain the whole turn at once. When
  // the caller supplied a per-sample bound, the union stops being a size
  // authority: it may still be reported, but it must not grow the crop and
  // it must not decide feasibility. Position is the camera path's job.
  const perFrameMin = Number(perFrameMinCropPx);
  const dynamicFeasibility = Number.isFinite(perFrameMin) && perFrameMin > 0;
  const feasibilityMode: "static" | "dynamic" = dynamicFeasibility ? "dynamic" : "static";

  // ── V457 — the crop MUST contain the padded dispatch box ─────────────
  let containsTarget: boolean | null = null;
  let containReason: ContainReason = "no_contain_box";
  let shiftPx = { x: 0, y: 0 };
  let sizeGrown = false;
  let sizeGrownPx = 0;
  let projectionApplied = false;
  let projectionDiscarded = false;
  let projectionRequiredGrowth = false;
  const containBox = normalizeContainBox(input.containBox);
  if (containBox) {
    const p = projectCropToContain({ x, y, size }, containBox, plateWidth, plateHeight);
    containReason = p.reason;
    projectionRequiredGrowth = p.sizeGrown;
    if (!dynamicFeasibility) {
      // STATIC — unchanged: the projection owns position AND size.
      shiftPx = p.shiftPx;
      sizeGrown = p.sizeGrown;
      sizeGrownPx = p.sizeGrownPx;
      x = p.crop.x;
      y = p.crop.y;
      size = p.crop.size;
      projectionApplied = true;
    } else if (!p.sizeGrown) {
      // DYNAMIC, and the union happens to FIT at the chosen size: take
      // the shift. Repositioning is free and strictly helps — it is what
      // lets a static-equivalent path still cover the whole turn.
      shiftPx = p.shiftPx;
      x = p.crop.x;
      y = p.crop.y;
      projectionApplied = true;
    } else {
      projectionDiscarded = true;
    }
    // DYNAMIC and the union would have to GROW the crop: discard the
    // projection entirely. Growing to the time-union is exactly the false
    // constraint this mode exists to remove; the camera path re-windows
    // per frame and the planner confirmation decides.

    // V519 — the verdict describes the crop that is RETURNED, never the
    // one that was discarded. Downstream (Contract E, V464, telemetry)
    // reads this as a statement about the rendered geometry, and for a
    // discarded projection the two answers differ.
    containsTarget = x <= containBox[0] && y <= containBox[1] &&
      x + size >= containBox[2] && y + size >= containBox[3];
  }

  const clamped = x !== rawX || y !== rawY;

  // ── V461 D — prove the interval, do not assume it ────────────────────
  //
  // Lower bound: the crop must hold the face bbox and, when supplied, the
  // padded contain box. Upper bound: the share cap. When the lower bound
  // exceeds the upper one there is genuinely NO admissible crop, and the
  // caller must refuse to render instead of shipping a doomed pre-clip.
  const containSide = containBox
    ? Math.max(containBox[2] - containBox[0], containBox[3] - containBox[1])
    : 0;
  const minCropStaticPx = Math.ceil(Math.max(faceFloor, containSide));
  const minCropDynamicPx = dynamicFeasibility
    ? Math.ceil(Math.max(faceFloor, perFrameMin))
    : null;
  const minCropRequiredPx = dynamicFeasibility ? minCropDynamicPx! : minCropStaticPx;

  // ── V520 — ONE AUTHORITY DECIDES BOTH ENDS ─────────────────────────
  //
  // In the dynamic regime the lower bound is measured on the turn track.
  // The upper bound must be measured there too, or the interval compares
  // two different faces at two different scales and refuses a pass that
  // is perfectly renderable. When the caller supplied no track cap the
  // behaviour is unchanged, which is also the static regime.
  const trackCap = Number(dynamicShareCapPx);
  const useTrackCap = dynamicFeasibility && Number.isFinite(trackCap) && trackCap > 0;
  const shareCapAuthority: "anchor_snapshot" | "turn_track" = useTrackCap
    ? "turn_track"
    : "anchor_snapshot";
  const effectiveShareCapPx = useTrackCap ? Math.floor(trackCap) : shareCap;
  const feasible = effectiveShareCapPx === null
    ? true
    : minCropRequiredPx <= effectiveShareCapPx;
  const infeasibleReason = feasible
    ? null
    : `min_crop_${minCropRequiredPx}px_exceeds_face_share_cap_${effectiveShareCapPx}px` +
      (useTrackCap ? ":track_authority" : "");

  const cropArea = size * size;
  const faceShareInCrop = Math.min(1, faceArea / cropArea);
  // V458 — everything below is derived from the FINAL (post-V457) geometry.
  const cropCx = x + size / 2;
  const cropCy = y + size / 2;
  // SIGNED plate-pixel vector. NEVER round the components (odd crop sizes
  // legitimately produce half-pixel centers).
  const mouthOffsetXy = usingMouth ? { dx: ax - cropCx, dy: ay - cropCy } : null;
  // Legacy scalar stays coherent with the vector it is derived from.
  const mouthOffsetPx = mouthOffsetXy
    ? Math.round(Math.hypot(mouthOffsetXy.dx, mouthOffsetXy.dy))
    : 0;

  return {
    crop: { x, y, size, outputSize },
    anchor,
    faceShareInCrop,
    mouthOffsetPx,
    mouthOffsetXy,
    mouthOffsetSpace: V458_MOUTH_OFFSET_SPACE,
    clamped,
    containsTarget,
    projectionApplied,
    projectionDiscarded,
    projectionRequiredGrowth,
    containReason,
    shiftPx,
    sizeGrown,
    sizeGrownPx,
    maxCropByFaceShare,
    minCropRequiredPx,
    feasible,
    infeasibleReason,
    preferredFloorYielded,
    feasibilityMode,
    shareCapAuthority,
    effectiveShareCapPx,
    minCropStaticPx,
    minCropDynamicPx,
  };
}
