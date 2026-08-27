/**
 * V516 — MOUTH AUTHORITY / SNAPSHOT BBOX COHERENCE
 * ---------------------------------------------------------------------------
 * Scene 67b392b1, generation 14, pass 5 (Kay Mark). The pre-dispatch face gate
 * refused the pass with `preclip_mouth_roi_outside_crop`, margin −0.0658. Every
 * number the gate reported was correct.
 *
 * The crop it judged was built from TWO authorities measured at DIFFERENT
 * times, and nothing checked that they described the same face:
 *
 *   SIZE     ← `platePassBoxForPreclip`, the assignment-locked plate-identity
 *              box from ONE reference frame:      [572, 474, 637, 581]
 *   POSITION ← `v477Authority.mouth`, the component-wise median of the mouth
 *              landmark over the WHOLE turn:      [641, ~528]
 *
 * 641 lies 4 px beyond the snapshot box's right edge. A mouth landmark cannot
 * be outside the face it belongs to — but the resolver hands a supplied
 * landmark through verbatim, so the planner centred a 165 px crop on a point
 * 15 px from the plate's right edge. The crop clamped to its only admissible
 * position (x = 656 − 165 = 491), which put the mouth at 0.909 of the frame
 * width, and the mouth band overhung the edge by 10.85 plate px.
 *
 * That overhang is INDEPENDENT of the crop size: the band's half-width is
 * 0.62·√(65·107)/2 = 25.85 plate px while the mouth sits 15 px from the plate
 * edge. No crop the planner could have chosen would have contained it. The
 * defect is neither the gate nor the planner — it is the pairing.
 *
 * SCOPE — deliberately narrow:
 *   · This module decides ONLY which landmark may be paired with THIS snapshot
 *     bbox. It does not resolve a mouth, does not estimate pose, and does not
 *     touch identity: the speaker's box is already chosen by the assignment
 *     authority before this runs.
 *   · The V477 aggregate keeps its authority whenever it is coherent. This is
 *     a validation rule, not a demotion.
 *   · No tolerance. The containment test is the raw bbox, boundary-inclusive.
 *     A padded or scaled variant would be a threshold invented to make one
 *     production pass succeed, and the next incoherent pair would be a
 *     slightly larger one.
 */

export type V516MouthSource = "v477_track" | "snapshot_landmark" | "pose_estimate";

export type V516RejectedReason =
  | "track_mouth_outside_snapshot_bbox"
  | "snapshot_mouth_outside_snapshot_bbox"
  | null;

export interface V516MouthAuthorityDecision {
  /**
   * The landmark to hand to `resolveMouthAnchorPoseAware`. `null` means no
   * trustworthy landmark for this bbox — the resolver's existing pose-estimate
   * path takes over, unchanged.
   */
  landmark: [number, number] | null;
  /** What the pre-V516 code would have used. */
  requestedSource: V516MouthSource;
  /** What this decision selected. */
  selectedSource: V516MouthSource;
  trackMouth: [number, number] | null;
  snapshotMouth: [number, number] | null;
  bbox: [number, number, number, number] | null;
  rejectedReason: V516RejectedReason;
  /** Set when the bbox could not be read, so no coherence claim was possible. */
  coherenceChecked: boolean;
}

export const V516_MOUTH_COHERENCE_VERSION = "v516";

/**
 * `Number(null)` is 0 and `Number("")` is 0, so a coordinate that is simply
 * ABSENT would read as a real measurement at plate 0 — the same trap
 * `usableCameraKeyframes` documents in the V461 gate. A fabricated point is
 * worse than no point: it is outside almost every bbox and would silently
 * turn a missing landmark into a coherence rejection.
 */
function strictNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function finitePoint(p: unknown): [number, number] | null {
  if (!Array.isArray(p) || p.length !== 2) return null;
  const x = strictNum(p[0]);
  const y = strictNum(p[1]);
  if (x === null || y === null) return null;
  return [x, y];
}

function finiteBox(b: unknown): [number, number, number, number] | null {
  if (!Array.isArray(b) || b.length !== 4) return null;
  const v = b.map(strictNum);
  if (!v.every((n): n is number => n !== null)) return null;
  const [x1, y1, x2, y2] = v;
  // A degenerate box cannot support a containment statement.
  if (!(x2 > x1) || !(y2 > y1)) return null;
  return [x1, y1, x2, y2];
}

/**
 * PURE — is this mouth inside this face box? Boundary-inclusive.
 *
 * The box is the RAW plate face box, not the padded dispatch box: the padding
 * exists to give the provider headroom, not to widen what counts as the same
 * measurement.
 */
export function mouthInsideBbox(mouth: unknown, bbox: unknown): boolean {
  const m = finitePoint(mouth);
  const b = finiteBox(bbox);
  if (!m || !b) return false;
  return m[0] >= b[0] && m[0] <= b[2] && m[1] >= b[1] && m[1] <= b[3];
}

/**
 * PURE — which landmark may be paired with this snapshot bbox.
 *
 * Precedence:
 *   1. the V477 turn aggregate, when it lies inside the snapshot bbox;
 *   2. otherwise the same-snapshot landmark, when it lies inside it;
 *   3. otherwise no landmark — the caller's existing pose estimate decides.
 *
 * An unreadable bbox yields the pre-V516 behaviour verbatim (`track ?? snapshot`)
 * and reports `coherenceChecked: false`. Refusing a landmark on the strength of
 * a box we could not read would be a new failure mode, not a fix.
 */
export function chooseCoherentMouthAuthority(input: {
  bbox?: unknown;
  trackMouth?: unknown;
  snapshotMouth?: unknown;
}): V516MouthAuthorityDecision {
  const bbox = finiteBox(input?.bbox);
  const trackMouth = finitePoint(input?.trackMouth);
  const snapshotMouth = finitePoint(input?.snapshotMouth);

  const requestedSource: V516MouthSource = trackMouth
    ? "v477_track"
    : snapshotMouth
    ? "snapshot_landmark"
    : "pose_estimate";

  const base = {
    requestedSource,
    trackMouth,
    snapshotMouth,
    bbox,
    coherenceChecked: bbox !== null,
  };

  if (!bbox) {
    const landmark = trackMouth ?? snapshotMouth;
    return {
      ...base,
      landmark,
      selectedSource: requestedSource,
      rejectedReason: null,
    };
  }

  if (trackMouth && mouthInsideBbox(trackMouth, bbox)) {
    return { ...base, landmark: trackMouth, selectedSource: "v477_track", rejectedReason: null };
  }

  const trackRejected = trackMouth !== null;

  if (snapshotMouth && mouthInsideBbox(snapshotMouth, bbox)) {
    return {
      ...base,
      landmark: snapshotMouth,
      selectedSource: "snapshot_landmark",
      rejectedReason: trackRejected ? "track_mouth_outside_snapshot_bbox" : null,
    };
  }

  return {
    ...base,
    landmark: null,
    selectedSource: "pose_estimate",
    rejectedReason: trackRejected
      ? "track_mouth_outside_snapshot_bbox"
      : snapshotMouth
      ? "snapshot_mouth_outside_snapshot_bbox"
      : null,
  };
}

/** PURE — bounded, URL-free telemetry for the pass record. */
export function buildV516MouthAuthorityTelemetry(
  d: V516MouthAuthorityDecision,
): Record<string, unknown> {
  return {
    requested_source: d.requestedSource,
    selected_source: d.selectedSource,
    track_mouth: d.trackMouth,
    snapshot_mouth: d.snapshotMouth,
    bbox: d.bbox,
    rejected_reason: d.rejectedReason,
    coherence_checked: d.coherenceChecked,
    version: V516_MOUTH_COHERENCE_VERSION,
  };
}
