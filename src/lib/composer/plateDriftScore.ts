/**
 * plateDriftScore — v243
 *
 * Analyses N face-detection samples taken across the duration of a
 * multi-speaker dialog plate and decides whether the master clip is
 * layout-stable enough to run the Sync.so multi-pass lip-sync pipeline.
 *
 * Key design constraint (user requirement, 2026-07-16):
 *   Speakers MAY move — gesture, walk in place, write, look around —
 *   but the CAMERA and FRAME COMPOSITION must remain locked and no
 *   speaker may leave the frame. Anything else kills the overlay.
 *
 * Thresholds are tuned so natural head/body movement (Bbox center wanders
 * within its own region) does NOT trigger drift, but a mid-clip cut,
 * layout change (row → 2x2 grid), speaker exit, or camera reframe DOES.
 */

export type Bbox = readonly [number, number, number, number]; // [x1, y1, x2, y2]

export interface PlateSampleFace {
  /** Optional stable character id from plate identity resolution. */
  characterId?: string | null;
  bbox: Bbox;
  /** [cx, cy] — precomputed center or derived from bbox. */
  center?: readonly [number, number];
  /** Detection confidence, 0..1. */
  confidence?: number;
}

export interface PlateSample {
  /** Sample timestamp in seconds. */
  t: number;
  faces: PlateSampleFace[];
}

export interface PlateDims {
  width: number;
  height: number;
}

export type DriftTransitionKind =
  | 'face_count_change'
  | 'row_cluster_change'
  | 'bbox_out_of_frame'
  | 'bbox_jump'
  | 'character_reid_mismatch';

export interface DriftTransition {
  kind: DriftTransitionKind;
  fromSampleT: number;
  toSampleT: number;
  detail?: string;
}

export interface DriftReport {
  layoutStable: boolean;
  driftScore: number; // 0 = rock solid, 1 = fully drifted
  hardDrift: boolean;
  transitions: DriftTransition[];
  /** Number of samples actually compared. */
  sampleCount: number;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

function centerOf(face: PlateSampleFace): [number, number] {
  if (face.center) return [face.center[0], face.center[1]];
  const [x1, y1, x2, y2] = face.bbox;
  return [(x1 + x2) / 2, (y1 + y2) / 2];
}

/** Cluster faces into rows by Y. Returns row count. */
function rowClusterCount(faces: PlateSampleFace[], frameHeight: number): number {
  if (faces.length <= 1) return faces.length;
  const centers = faces.map((f) => centerOf(f)[1]).sort((a, b) => a - b);
  // A new row starts whenever the vertical gap between consecutive
  // centers exceeds 15% of the frame height.
  const gapThreshold = frameHeight * 0.15;
  let rows = 1;
  for (let i = 1; i < centers.length; i++) {
    if (centers[i] - centers[i - 1] > gapThreshold) rows++;
  }
  return rows;
}

/** Greedy nearest-center pairing between two samples. */
function pairByNearestCenter(
  a: PlateSampleFace[],
  b: PlateSampleFace[],
): Array<{ a: PlateSampleFace; b: PlateSampleFace; distSq: number }> {
  const pairs: Array<{ a: PlateSampleFace; b: PlateSampleFace; distSq: number }> = [];
  const usedB = new Set<number>();
  for (const fa of a) {
    const [cax, cay] = centerOf(fa);
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let j = 0; j < b.length; j++) {
      if (usedB.has(j)) continue;
      const [cbx, cby] = centerOf(b[j]);
      const d = (cax - cbx) ** 2 + (cay - cby) ** 2;
      if (d < bestDist) {
        bestDist = d;
        bestIdx = j;
      }
    }
    if (bestIdx >= 0) {
      usedB.add(bestIdx);
      pairs.push({ a: fa, b: b[bestIdx], distSq: bestDist });
    }
  }
  return pairs;
}

function bboxInFrame(bbox: Bbox, dims: PlateDims): boolean {
  const [x1, y1, x2, y2] = bbox;
  return (
    x1 >= 0 &&
    y1 >= 0 &&
    x2 <= dims.width &&
    y2 <= dims.height &&
    x2 > x1 &&
    y2 > y1
  );
}

/**
 * Score plate stability across time samples.
 *
 * @param samples ordered oldest→newest.
 * @param dims master clip dimensions.
 */
export function scorePlateDrift(
  samples: PlateSample[],
  dims: PlateDims,
): DriftReport {
  if (!samples || samples.length < 2) {
    return {
      layoutStable: true,
      driftScore: 0,
      hardDrift: false,
      transitions: [],
      sampleCount: samples?.length ?? 0,
    };
  }

  const transitions: DriftTransition[] = [];
  const first = samples[0];
  const baseCount = first.faces.length;
  const baseRows = rowClusterCount(first.faces, dims.height);

  let softDriftAccum = 0;
  let softDriftSteps = 0;
  let hardDrift = false;

  // Jump threshold: > 50% of frame width between two adjacent samples =
  // camera cut. Soft-drift horizon: up to 25% of frame width is still
  // considered natural speaker movement.
  const hardJumpSq = (dims.width * 0.5) ** 2;
  const softJumpSq = (dims.width * 0.25) ** 2;

  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1];
    const cur = samples[i];

    // 1. Face count stability.
    if (cur.faces.length !== baseCount) {
      hardDrift = true;
      transitions.push({
        kind: 'face_count_change',
        fromSampleT: prev.t,
        toSampleT: cur.t,
        detail: `expected=${baseCount} got=${cur.faces.length}`,
      });
    }

    // 2. Row cluster stability (row → 2x2 grid change is the signature
    //    of the exact bug we're guarding against).
    const curRows = rowClusterCount(cur.faces, dims.height);
    if (curRows !== baseRows) {
      hardDrift = true;
      transitions.push({
        kind: 'row_cluster_change',
        fromSampleT: prev.t,
        toSampleT: cur.t,
        detail: `rows ${baseRows} → ${curRows}`,
      });
    }

    // 3. Per-face frame membership + jump distance.
    const pairs = pairByNearestCenter(prev.faces, cur.faces);
    for (const p of pairs) {
      if (!bboxInFrame(p.b.bbox, dims)) {
        hardDrift = true;
        transitions.push({
          kind: 'bbox_out_of_frame',
          fromSampleT: prev.t,
          toSampleT: cur.t,
          detail: `bbox=${JSON.stringify(p.b.bbox)}`,
        });
        continue;
      }
      if (p.distSq > hardJumpSq) {
        hardDrift = true;
        transitions.push({
          kind: 'bbox_jump',
          fromSampleT: prev.t,
          toSampleT: cur.t,
          detail: `dist=${Math.sqrt(p.distSq).toFixed(1)}px`,
        });
      } else if (p.distSq > softJumpSq) {
        softDriftAccum += Math.sqrt(p.distSq) / dims.width;
        softDriftSteps++;
      }
    }

    // 4. Character re-identification, when ids are supplied.
    if (prev.faces.some((f) => f.characterId) && cur.faces.some((f) => f.characterId)) {
      const prevIds = new Set(prev.faces.map((f) => f.characterId).filter(Boolean) as string[]);
      const curIds = new Set(cur.faces.map((f) => f.characterId).filter(Boolean) as string[]);
      // If both samples supply ids and any id from prev is missing in cur
      // (and vice versa), a speaker was swapped/removed.
      const missing = [...prevIds].filter((id) => !curIds.has(id));
      const added = [...curIds].filter((id) => !prevIds.has(id));
      if (missing.length > 0 || added.length > 0) {
        hardDrift = true;
        transitions.push({
          kind: 'character_reid_mismatch',
          fromSampleT: prev.t,
          toSampleT: cur.t,
          detail: `missing=${missing.join(',') || '-'} added=${added.join(',') || '-'}`,
        });
      }
    }
  }

  const softAvg = softDriftSteps > 0 ? softDriftAccum / softDriftSteps : 0;
  const driftScore = hardDrift ? 1 : clamp01(softAvg * 2); // 25% width avg ≈ 0.5
  const layoutStable = !hardDrift;

  return {
    layoutStable,
    driftScore,
    hardDrift,
    transitions,
    sampleCount: samples.length,
  };
}
