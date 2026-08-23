/**
 * V469 — PRE-DISPATCH MOUTH-VISIBILITY / POSE-SUITABILITY GATE (PURE)
 * ---------------------------------------------------------------------------
 * WHY (V468 evidence, scene be60d106…, S01)
 *
 *   Pass 0 (NOOP) is a ~90° profile shot in which the mouth is practically not
 *   visible / not editable. Passes 1, 2, 4 all show a usable mouth. The
 *   dispatched REQUESTS were byte-equivalent in structure — the difference is
 *   the INPUT CONTENT.
 *
 * WHAT THIS GATE IS *NOT*
 *
 *   It is explicitly NOT a `yaw >= X° → block` cut. V463 produced a MOVED
 *   result for an S01 input at ~75° yaw, so a hard yaw threshold would reject
 *   demonstrably processable inputs. Yaw is carried as a RISK SIGNAL and pure
 *   telemetry — it never decides on its own.
 *
 * THE CONTRACT
 *
 *   "Is the mouth, over enough relevant frames of this pre-clip, actually
 *    visible and geometrically editable?"
 *
 *   Per-frame evidence (from the frozen plate face track):
 *     1. face present and identity-stable (track sample has a valid box),
 *     2. mouth landmark / anchor available for that frame,
 *     3. mouth box not collapsed (face width/height not degenerate),
 *     4. mouth point lies inside the visible face region with a margin
 *        (not pinned to the occluded silhouette edge),
 *     5. no strong lateral self-occlusion (face aspect collapse).
 *
 *   A frame that satisfies all of them is USABLE. If the usable rate over the
 *   turn falls below `V469_MIN_USABLE_FRAME_RATE`, the pre-clip breaks the
 *   input contract → `lipsync_input_contract_violation` → NO provider call,
 *   canonical refund.
 *
 * FAIL-OPEN BY DESIGN
 *
 *   Missing evidence (no face track, e.g. static crop or NOOP retry reuse) is
 *   NOT a block. V469 only blocks on POSITIVE evidence that the mouth is
 *   unusable. Everything else stays exactly as before — no changes to V465 /
 *   V466 verdicts, ASD projection, provider payload or refund logic.
 *
 * NOT IN SCOPE (deliberately, per authorization)
 *
 *   The input mouth/frame motion ratio (P0 0.60, P1 0.51 vs P2 1.41, P4 1.06)
 *   is DOCUMENTED as telemetry only. Four passes of one scene are far too few
 *   to build a gate on, and Pass 1 (frontal, correct request, provider edits
 *   the mouth, mouth_over_frame 1.817) is a SEPARATE unsolved case that V469
 *   deliberately does not try to solve.
 */

export const V469_GATE_VERSION = "v469";

/** Fraction of evaluated frames that must have a usable mouth. */
export const V469_MIN_USABLE_FRAME_RATE = 0.35;

/** Minimum number of track samples required before the gate may block. */
export const V469_MIN_EVALUATED_FRAMES = 6;

/**
 * Face box aspect (width / height) below which the head is so strongly turned
 * that the mouth region collapses into the silhouette. Empirical: frontal
 * S01 faces sit at 0.72–0.95, the ~75° V463 MOVED case at ~0.55, the ~90°
 * P0 profile at ~0.30–0.40.
 */
export const V469_FACE_ASPECT_FLOOR = 0.45;

/**
 * How far inside the face box (as a fraction of face width) the mouth anchor
 * must sit. A mouth pinned onto the outer silhouette edge is the geometric
 * signature of lateral self-occlusion.
 */
export const V469_MOUTH_EDGE_MARGIN = 0.06;

/** Purely informational risk band — never a decision on its own. */
export const V469_YAW_RISK_DEG = 60;

export type V469Box = [number, number, number, number];

export interface V469TrackSample {
  t: number;
  box?: V469Box | null;
  mouth?: [number, number] | null;
}

export interface V469GateInput {
  /** false → full-plate dispatch, gate not applicable. */
  usePreclip: boolean;
  /** Frozen plate face track (plate-absolute seconds). */
  faceTrack?: V469TrackSample[] | null;
  /** Turn window in plate-absolute seconds; limits the evaluated frames. */
  turnStartSec?: number | null;
  turnEndSec?: number | null;
  /** `preclip_anchor` — "mouth…" means a real mouth landmark drove the crop. */
  anchor?: string | null;
  /** Plate yaw estimate — RISK SIGNAL / TELEMETRY ONLY. */
  yawDeg?: number | null;
  /** Input mouth/frame motion ratio — DOCUMENTED ONLY, never gating (V468). */
  inputMouthOverFrame?: number | null;
}

export interface V469GateMetrics {
  evaluated_frames: number;
  face_frames: number;
  usable_frames: number;
  usable_frame_rate: number | null;
  mouth_landmark_rate: number | null;
  median_face_aspect: number | null;
  aspect_collapsed_rate: number | null;
  mouth_on_edge_rate: number | null;
  yaw_deg: number | null;
  yaw_risk: boolean;
  input_mouth_over_frame: number | null;
  min_usable_frame_rate: number;
}

export type V469Check =
  | "evidence"
  | "face_present"
  | "mouth_visibility";

export interface V469GateResult {
  ok: boolean;
  status: "pass" | "block" | "skipped" | "unevaluated";
  code: string;
  reason: string;
  failedCheck: V469Check | null;
  metrics: V469GateMetrics;
  version: string;
}

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function validBox(b: unknown): V469Box | null {
  if (!Array.isArray(b) || b.length !== 4) return null;
  const v = b.map(num);
  if (v.some((n) => n === null)) return null;
  const [x1, y1, x2, y2] = v as number[];
  if (!(x2 - x1 > 1) || !(y2 - y1 > 1)) return null;
  return [x1, y1, x2, y2];
}

/** PURE — the V469 mouth-visibility / pose-suitability contract. */
export function evaluateV469MouthVisibility(input: V469GateInput): V469GateResult {
  const yaw = num(input?.yawDeg);
  const metrics: V469GateMetrics = {
    evaluated_frames: 0,
    face_frames: 0,
    usable_frames: 0,
    usable_frame_rate: null,
    mouth_landmark_rate: null,
    median_face_aspect: null,
    aspect_collapsed_rate: null,
    mouth_on_edge_rate: null,
    yaw_deg: yaw,
    yaw_risk: yaw !== null && Math.abs(yaw) >= V469_YAW_RISK_DEG,
    input_mouth_over_frame: num(input?.inputMouthOverFrame),
    min_usable_frame_rate: V469_MIN_USABLE_FRAME_RATE,
  };

  const done = (
    status: V469GateResult["status"],
    code: string,
    reason: string,
    failedCheck: V469Check | null,
  ): V469GateResult => ({
    ok: status !== "block",
    status,
    code,
    reason,
    failedCheck,
    metrics,
    version: V469_GATE_VERSION,
  });

  if (!input?.usePreclip) {
    return done("skipped", "gate_not_applicable", "full_plate_dispatch", null);
  }

  const start = num(input.turnStartSec);
  const end = num(input.turnEndSec);
  const all = Array.isArray(input.faceTrack) ? input.faceTrack : [];
  const inWindow = all.filter((s) => {
    const t = num(s?.t);
    if (t === null) return true;
    if (start !== null && t < start - 0.001) return false;
    if (end !== null && t > end + 0.001) return false;
    return true;
  });
  const samples = inWindow.length > 0 ? inWindow : all;
  metrics.evaluated_frames = samples.length;

  // FAIL-OPEN: no (or too little) evidence is not a contract violation.
  if (samples.length < V469_MIN_EVALUATED_FRAMES) {
    return done(
      "unevaluated",
      "mouth_visibility_evidence_insufficient",
      `only ${samples.length} track samples (< ${V469_MIN_EVALUATED_FRAMES}) — gate not evaluated`,
      null,
    );
  }

  const anchorIsMouth = typeof input.anchor === "string" &&
    input.anchor.toLowerCase().startsWith("mouth");

  let faceFrames = 0;
  let mouthFrames = 0;
  let usable = 0;
  let collapsed = 0;
  let onEdge = 0;
  const aspects: number[] = [];

  for (const s of samples) {
    const box = validBox(s?.box);
    if (!box) continue;
    faceFrames += 1;
    const [x1, y1, x2, y2] = box;
    const w = x2 - x1;
    const h = y2 - y1;
    const aspect = w / h;
    aspects.push(aspect);
    const aspectOk = aspect >= V469_FACE_ASPECT_FLOOR;
    if (!aspectOk) collapsed += 1;

    const mouth = Array.isArray(s?.mouth) && s!.mouth!.length === 2 &&
        num(s!.mouth![0]) !== null && num(s!.mouth![1]) !== null
      ? [Number(s!.mouth![0]), Number(s!.mouth![1])] as [number, number]
      : null;
    if (mouth) mouthFrames += 1;

    // A frame is usable when the mouth is (a) actually located and (b) sits
    // inside the visible face region with a margin, on a non-collapsed face.
    let mouthInside = false;
    if (mouth) {
      const mx = mouth[0];
      const my = mouth[1];
      mouthInside = mx >= x1 + w * V469_MOUTH_EDGE_MARGIN &&
        mx <= x2 - w * V469_MOUTH_EDGE_MARGIN &&
        my >= y1 && my <= y2 + h * 0.05;
      if (!mouthInside) onEdge += 1;
    }

    if (aspectOk && (mouthInside || (!mouth && anchorIsMouth))) usable += 1;
  }

  metrics.face_frames = faceFrames;
  metrics.usable_frames = usable;
  metrics.median_face_aspect = median(aspects);
  metrics.mouth_landmark_rate = faceFrames > 0 ? mouthFrames / faceFrames : null;
  metrics.aspect_collapsed_rate = faceFrames > 0 ? collapsed / faceFrames : null;
  metrics.mouth_on_edge_rate = mouthFrames > 0 ? onEdge / mouthFrames : null;
  metrics.usable_frame_rate = samples.length > 0 ? usable / samples.length : null;

  // No face at all in the track → no positive evidence about the mouth.
  // Identity/geometry is already fail-closed in V461; V469 stays fail-open.
  if (faceFrames < V469_MIN_EVALUATED_FRAMES) {
    return done(
      "unevaluated",
      "mouth_visibility_evidence_insufficient",
      `only ${faceFrames} tracked face frames — gate not evaluated`,
      null,
    );
  }

  const rate = metrics.usable_frame_rate ?? 1;
  if (rate < V469_MIN_USABLE_FRAME_RATE) {
    return done(
      "block",
      "preclip_mouth_not_visible",
      `usable mouth in ${(rate * 100).toFixed(0)}% of frames (< ${(V469_MIN_USABLE_FRAME_RATE * 100).toFixed(0)}%)` +
        `; median_face_aspect=${metrics.median_face_aspect?.toFixed(2) ?? "?"}` +
        `, mouth_landmark_rate=${metrics.mouth_landmark_rate?.toFixed(2) ?? "?"}`,
      "mouth_visibility",
    );
  }

  return done("pass", "mouth_visible", "mouth usable over enough frames", null);
}
