/**
 * V520 — SINGLE-AUTHORITY CROP FEASIBILITY
 * ---------------------------------------------------------------------------
 * Scene 67b392b1, generation 17, pass 1 (Sarah Dusatko). The planner refused
 * to render before any provider dispatch:
 *
 *   preclip_crop_contract_unsatisfiable:
 *   min_crop_269px_exceeds_face_share_cap_212px
 *
 * The refusal is fail-closed and correct. The interval it refused is not: its
 * two ends were measured by two different authorities.
 *
 *   UPPER  ← `face.bbox`, the assignment-locked snapshot: 87 x 124
 *            cap = sqrt(87*124 / 0.24) = 212 px
 *   LOWER  ← `turnFaceBoxes`, the V477 turn track: a sample ~247 px
 *            required = 247 / (1 - 2*0.04) = 269 px
 *
 * `269 > 212` compares an ANCHOR-scale face against a TRACK-scale one. The
 * same speaker's other turn in the very same generation planned a 191 px crop,
 * passed the V461 gate and the V519 containment, and was dispatched: Sarah's
 * face is not intrinsically un-croppable. The scales were.
 *
 * ── WHY THERE IS NO NEW THRESHOLD HERE ─────────────────────────────────────
 * Both rules below fall out of constants that already exist:
 *
 *   · SELF-FEASIBILITY. A sample must be able to satisfy the face-share floor
 *     on its own geometry: `max(w,h)/usable <= sqrt(w*h/floor)`. With the
 *     existing 0.24 and the existing 4 % containment pad, that admits any box
 *     up to roughly 3.5:1 — every real face, and no smear or two-face merge.
 *     Nothing is invented; the rule is the two constants, rearranged.
 *
 *   · CHAIN CONNECTION. A sample must overlap the assignment-locked box or the
 *     previous accepted sample. A face that moves stays connected; a track
 *     that jumps to another speaker does not. It is a boundary test, not a
 *     tolerance — the same shape as V516's raw-bbox containment rule.
 *
 * The whole point is that both ends of the interval now come from the SAME
 * measurement. A sample that is allowed to raise the floor is a sample whose
 * own area also raises the cap.
 */

export type TrackSampleReject =
  | "invalid_box"
  | "self_infeasible"
  | "not_chain_connected"
  | "scale_incoherent_with_anchor";

export interface TrackBox {
  box: [number, number, number, number];
  t: number | null;
}

export interface SanitizedTrack {
  accepted: TrackBox[];
  rejected: Array<{ index: number; reason: TrackSampleReject }>;
  /** Counts only, so telemetry stays bounded on long turns. */
  rejectedCounts: Record<TrackSampleReject, number>;
}

export interface TrackFeasibility {
  /** Largest crop side that still lets EVERY accepted sample reach the floor. */
  maxCropByFaceSharePx: number | null;
  /** Smallest crop side that can hold EVERY accepted sample. */
  minCropRequiredPx: number | null;
  feasible: boolean;
  /** Which sample set decided each bound — always the same one. */
  authority: "turn_track";
  sampleCount: number;
  infeasibleReason: string | null;
}

const finiteBox = (b: unknown): [number, number, number, number] | null => {
  if (!Array.isArray(b) || b.length !== 4) return null;
  const v = b.map((n) => Number(n));
  if (!v.every((n) => Number.isFinite(n))) return null;
  if (!(v[2] > v[0]) || !(v[3] > v[1])) return null;
  return [v[0], v[1], v[2], v[3]];
};

/** PURE — do two boxes share any area? Boundary touching does not count. */
export function boxesOverlap(
  a: [number, number, number, number],
  b: [number, number, number, number],
): boolean {
  return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
}

/** PURE — the crop side this sample needs, in the planner's own contract. */
export function requiredCropForSample(
  box: [number, number, number, number],
  padRatio: number,
): number {
  const usable = 1 - 2 * padRatio;
  if (!(usable > 0)) return Number.POSITIVE_INFINITY;
  return Math.max(box[2] - box[0], box[3] - box[1]) / usable;
}

/** PURE — the largest crop side at which this sample still reaches the floor. */
export function shareCapForSample(
  box: [number, number, number, number],
  faceShareFloor: number,
): number {
  if (!(faceShareFloor > 0)) return Number.POSITIVE_INFINITY;
  return Math.sqrt(((box[2] - box[0]) * (box[3] - box[1])) / faceShareFloor);
}

/**
 * PURE — which track samples may speak for this speaker's geometry.
 *
 * `anchorBox` is the assignment-locked snapshot box. It is used ONLY to start
 * the chain — identity is decided long before this, and nothing here renames a
 * speaker or picks a face.
 */
export function sanitizeTurnTrackSamples(input: {
  samples: Array<{ t?: number | null; box?: unknown } | unknown> | null | undefined;
  anchorBox: [number, number, number, number] | null | undefined;
  faceShareFloor: number;
  padRatio: number;
}): SanitizedTrack {
  const accepted: TrackBox[] = [];
  const rejected: Array<{ index: number; reason: TrackSampleReject }> = [];
  const rejectedCounts: Record<TrackSampleReject, number> = {
    invalid_box: 0,
    self_infeasible: 0,
    not_chain_connected: 0,
    scale_incoherent_with_anchor: 0,
  };
  const reject = (index: number, reason: TrackSampleReject) => {
    rejected.push({ index, reason });
    rejectedCounts[reason]++;
  };

  const anchor = finiteBox(input?.anchorBox);
  const list = Array.isArray(input?.samples) ? input.samples : [];

  for (let i = 0; i < list.length; i++) {
    const s = list[i] as any;
    const box = finiteBox(Array.isArray(s) ? s : s?.box);
    if (!box) {
      reject(i, "invalid_box");
      continue;
    }
    // A sample that cannot reach the floor on its own geometry is not a face
    // we can plan a crop around — and it is exactly the kind of box that
    // would otherwise raise the floor for everyone else.
    if (requiredCropForSample(box, input.padRatio) > shareCapForSample(box, input.faceShareFloor)) {
      reject(i, "self_infeasible");
      continue;
    }
    // Connected to the locked box, or to where this face last was.
    const prev = accepted.length > 0 ? accepted[accepted.length - 1].box : null;
    const connected = (anchor !== null && boxesOverlap(box, anchor)) ||
      (prev !== null && boxesOverlap(box, prev));
    // With no anchor and no predecessor the first valid sample starts the
    // chain: there is nothing yet to be incoherent with.
    if (!connected && (anchor !== null || prev !== null)) {
      reject(i, "not_chain_connected");
      continue;
    }
    // INCOMPATIBLE GEOMETRY SPACE. A sample that cannot share ANY crop size
    // with the assignment-locked measurement is not a usable measurement of
    // that face: no single crop could hold this box while a face of the
    // locked size still reached the floor. Generation 17, Sarah: a ~247 px
    // sample needs 269 px, and at 269 px her locked 87x124 face holds only
    // 15 % of the frame. The anchor is the identity authority, so when the
    // track contradicts it at this magnitude the track sample loses.
    //
    // Again no new constant: the admitted band is whatever 0.24 and the 4 %
    // pad allow, which is growth up to roughly 1.9x — a camera approach
    // passes, a jump to a differently-scaled face does not.
    if (
      anchor !== null &&
      requiredCropForSample(box, input.padRatio) > shareCapForSample(anchor, input.faceShareFloor)
    ) {
      reject(i, "scale_incoherent_with_anchor");
      continue;
    }
    const tRaw = Array.isArray(s) ? NaN : Number(s?.t);
    accepted.push({ box, t: Number.isFinite(tRaw) ? tRaw : null });
  }

  return { accepted, rejected, rejectedCounts };
}

/**
 * PURE — the feasible crop interval, both ends from the accepted samples.
 *
 * `max(required_i) <= size <= min(cap_i)`. The lower bound is what the largest
 * sample needs; the upper is what the smallest sample can still fill. A single
 * crop side has to satisfy both, and when it cannot, the refusal is now about
 * one measurement rather than two.
 */
export function evaluateTrackFeasibility(input: {
  accepted: TrackBox[];
  faceShareFloor: number;
  padRatio: number;
}): TrackFeasibility {
  const samples = input?.accepted ?? [];
  if (samples.length === 0) {
    return {
      maxCropByFaceSharePx: null,
      minCropRequiredPx: null,
      feasible: false,
      authority: "turn_track",
      sampleCount: 0,
      infeasibleReason: "no_coherent_track_samples",
    };
  }

  let minCrop = 0;
  let maxCrop = Number.POSITIVE_INFINITY;
  for (const s of samples) {
    minCrop = Math.max(minCrop, requiredCropForSample(s.box, input.padRatio));
    maxCrop = Math.min(maxCrop, shareCapForSample(s.box, input.faceShareFloor));
  }
  const minCropRequiredPx = Math.ceil(minCrop);
  const maxCropByFaceSharePx = Math.floor(maxCrop);
  const feasible = minCropRequiredPx <= maxCropByFaceSharePx;

  return {
    maxCropByFaceSharePx,
    minCropRequiredPx,
    feasible,
    authority: "turn_track",
    sampleCount: samples.length,
    infeasibleReason: feasible
      ? null
      : `track_min_crop_${minCropRequiredPx}px_exceeds_track_face_share_cap_${maxCropByFaceSharePx}px`,
  };
}

/** PURE — bounded telemetry. Counts, not per-sample arrays. */
export function buildTrackFeasibilityTelemetry(
  s: SanitizedTrack,
  f: TrackFeasibility,
): Record<string, unknown> {
  return {
    authority: f.authority,
    samples_accepted: f.sampleCount,
    samples_rejected: s.rejected.length,
    rejected_invalid_box: s.rejectedCounts.invalid_box,
    rejected_self_infeasible: s.rejectedCounts.self_infeasible,
    rejected_not_chain_connected: s.rejectedCounts.not_chain_connected,
    rejected_scale_incoherent: s.rejectedCounts.scale_incoherent_with_anchor,
    min_crop_required_px: f.minCropRequiredPx,
    max_crop_by_face_share_px: f.maxCropByFaceSharePx,
    feasible: f.feasible,
    infeasible_reason: f.infeasibleReason,
    version: "v520",
  };
}
