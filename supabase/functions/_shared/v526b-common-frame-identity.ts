/**
 * ═══════════════════════════════════════════════════════════════════════════
 * V526-B — COMMON-FRAME IDENTITY COMPLETION
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Scene 67b392b1, generation 24. V526-A sampled the scene correctly — frames
 * 23, 225 and 428 at the renderer's real 30 fps — and V525 delivered all three
 * stills. V524 then resolved 3/4 at frame 23 (missing Sarah), 3/4 at frame 225
 * (missing Matthew) and 1/4 at frame 428.
 *
 * Every character is biometrically resolvable somewhere in this plate. No
 * single sampled frame carries all four.
 *
 * The tempting repair is to union the frames: take Sarah from 225 and Matthew
 * from 23 and call that a cast. It is not. V523 compares the target box
 * against its siblings, and two boxes measured six seconds apart are not a
 * snapshot — that is the same referent split V522 closed for dispatch and V524
 * closed for anchor-versus-plate, one level down again.
 *
 * So identity evidence may cross frames; geometry may not. One frame T is the
 * target, the characters already resolved AT T stay exactly as measured there,
 * and the one that is missing is carried to T by the identity-locked
 * continuity rule the V452 tracker already uses:
 *
 *     biometric seed at S  →  proven step-by-step continuity  →  bbox AT T
 *
 * Every box handed on is measured or proven at T. Nothing about the biometric
 * matcher changes, and no threshold moves: if six seconds of continuity cannot
 * be proven under the existing picker, this fails closed, and that failure is
 * itself the measurement.
 *
 * Every primitive is INJECTED — frame acquisition, detection, the picker — so
 * this module stays a leaf with no AWS, no storage and no network, the same
 * discipline V519, V523, V524, V525 and V526-A use.
 */

import type { PlateNativeIdentityRecord } from "./v524-plate-identity-registration.ts";
import { stripCharacterIdPrefix } from "./v523-identity-repair.ts";

export type Box = [number, number, number, number];

export type CommonFrameFailure =
  /** No sampled frame is a usable target at all. */
  | "common_frame_invalid_target"
  /** The best target is missing two or more characters. */
  | "common_frame_too_many_missing"
  /** The missing character has no accepted biometric evidence anywhere. */
  | "common_frame_no_seed"
  /** Its only evidence is at or after the target; v1 is forward-only. */
  | "common_frame_seed_not_earlier"
  /** A seed exists but belongs to another scene, run, generation or plate. */
  | "common_frame_stale_seed"
  /** A step could not acquire or detect. */
  | "common_frame_track_broken"
  /** Two candidates were equally plausible at a step. */
  | "common_frame_ambiguous_step"
  /** The candidate at the target claims a character already resolved there. */
  | "common_frame_sibling_conflict";

/** One attempted registration frame and the characters it did resolve. */
export interface FrameAttemptEvidence {
  frame: number;
  /** Accepted biometric records at that frame. Never unresolved entries. */
  records: PlateNativeIdentityRecord[];
}

export interface CommonFrameFence {
  sceneId: string;
  runId: string | null;
  plateGeneration: number;
  baseVideoUrl: string;
  plateDims: { width: number; height: number };
}

export interface CommonFramePlan {
  ok: boolean;
  reason?: CommonFrameFailure;
  detail?: string;
  targetFrame?: number;
  /** The one character missing at the target. */
  characterId?: string;
  seedFrame?: number;
  seedBbox?: Box;
  seedSimilarity?: number | null;
  /** Strictly increasing, last entry is exactly the target. */
  stepFrames?: number[];
  /** Direct biometric records at the target, unchanged. */
  targetRecords?: PlateNativeIdentityRecord[];
  /** Identity-bound centres known AT the seed frame. */
  seedSiblingCenters?: Array<[number, number]>;
  /** Identity-bound centres known AT the target frame. */
  targetSiblingCenters?: Array<[number, number]>;
}

const isFiniteBox = (b: unknown): b is Box =>
  Array.isArray(b) && b.length === 4 && b.every((n) => Number.isFinite(Number(n)));

const centerOf = (b: Box): [number, number] => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];

/** Every fence a seed or target record must satisfy, exactly. */
function fenced(r: Partial<PlateNativeIdentityRecord>, f: CommonFrameFence): boolean {
  if (!r || !isFiniteBox(r.bbox)) return false;
  if (String(r.sceneId ?? "") !== String(f.sceneId ?? "")) return false;
  if (String(r.baseVideoUrl ?? "") !== String(f.baseVideoUrl ?? "")) return false;
  if (Number(r.plateGeneration) !== Number(f.plateGeneration)) return false;
  if (
    Number(r.plateDims?.width) !== Number(f.plateDims?.width) ||
    Number(r.plateDims?.height) !== Number(f.plateDims?.height)
  ) return false;
  if (f.runId && String(r.runId ?? "") !== String(f.runId)) return false;
  return !!stripCharacterIdPrefix(r.characterId);
}

/**
 * V526-B — choose the target, the missing character and the seed.
 *
 * The rule is deterministic and, for generation 24, forced:
 *
 *   1. the most directly resolved characters wins;
 *   2. exactly one may be missing — two doubles the cost and halves the
 *      provability, and nothing here is worth guessing twice;
 *   3. that character needs accepted evidence at a STRICTLY EARLIER frame,
 *      because the continuity contract is forward-only and has never been
 *      exercised backwards;
 *   4. shortest forward distance;
 *   5. lower target frame.
 *
 * Frame 23 loses at rule 3 (Sarah's only evidence is later), frame 428 at rule
 * 2. Frame 225 with Matthew seeded from 23 is what is left.
 */
export function planCommonFrameCompletion(params: {
  attempts: FrameAttemptEvidence[];
  requestedCharacterIds: Array<string | null | undefined>;
  fence: CommonFrameFence;
  fps: number;
  maxSteps: number;
  sampleTimes: (startSec: number, endSec: number, n: number) => number[];
}): CommonFramePlan {
  const fail = (reason: CommonFrameFailure, detail?: string): CommonFramePlan => ({
    ok: false,
    reason,
    detail,
  });

  const wanted = (params.requestedCharacterIds ?? [])
    .map((c) => stripCharacterIdPrefix(c))
    .filter((c) => !!c);
  if (wanted.length === 0) return fail("common_frame_invalid_target", "no requested characters");

  const fps = Number(params.fps);
  if (!Number.isFinite(fps) || fps <= 0) return fail("common_frame_invalid_target", "invalid fps");

  // Normalise each attempt to the accepted, fenced records it actually holds,
  // at most one per character.
  const byFrame = new Map<number, Map<string, PlateNativeIdentityRecord>>();
  for (const a of params.attempts ?? []) {
    const frame = Number(a?.frame);
    if (!Number.isFinite(frame) || frame < 0) continue;
    const m = byFrame.get(frame) ?? new Map<string, PlateNativeIdentityRecord>();
    for (const r of a?.records ?? []) {
      if (!fenced(r, params.fence)) continue;
      if (Number(r.frameNumber) !== frame) continue;
      const cid = stripCharacterIdPrefix(r.characterId);
      if (!wanted.includes(cid)) continue;
      // Two records for one character on one frame is not a tie to break.
      if (m.has(cid)) {
        m.delete(cid);
        continue;
      }
      m.set(cid, r as PlateNativeIdentityRecord);
    }
    byFrame.set(frame, m);
  }
  if (byFrame.size === 0) return fail("common_frame_invalid_target", "no fenced evidence");

  const frames = [...byFrame.keys()].sort((a, b) => a - b);
  const best = Math.max(...frames.map((f) => byFrame.get(f)!.size));
  if (best === 0) return fail("common_frame_invalid_target", "no frame resolved anybody");

  // Rule 1, then rule 2.
  const candidates = frames.filter((f) => byFrame.get(f)!.size === best);
  const missingAt = (f: number) => wanted.filter((c) => !byFrame.get(f)!.has(c));
  const single = candidates.filter((f) => missingAt(f).length === 1);
  if (single.length === 0) {
    const m = missingAt(candidates[0]).length;
    return fail(
      "common_frame_too_many_missing",
      `best target misses ${m} character${m === 1 ? "" : "s"}`,
    );
  }

  // Rules 3–5, evaluated together so the winner is the shortest provable hop.
  type Choice = { target: number; cid: string; seed: PlateNativeIdentityRecord; seedFrame: number };
  const viable: Choice[] = [];
  let sawLaterOnly = false;
  for (const target of single) {
    const cid = missingAt(target)[0];
    let seedFrame = -1;
    let seed: PlateNativeIdentityRecord | null = null;
    let later = false;
    for (const f of frames) {
      const hit = byFrame.get(f)!.get(cid);
      if (!hit) continue;
      if (f >= target) {
        later = true;
        continue;
      }
      // Latest earlier evidence — the shortest forward distance.
      if (f > seedFrame) {
        seedFrame = f;
        seed = hit;
      }
    }
    if (seed) viable.push({ target, cid, seed, seedFrame });
    else if (later) sawLaterOnly = true;
  }
  if (viable.length === 0) {
    return sawLaterOnly
      ? fail("common_frame_seed_not_earlier", "the only evidence is at or after every viable target")
      : fail("common_frame_no_seed", "the missing character resolved on no sampled frame");
  }
  viable.sort((a, b) =>
    (a.target - a.seedFrame) - (b.target - b.seedFrame) || a.target - b.target
  );
  const win = viable[0];

  const targetRecords = [...byFrame.get(win.target)!.values()];
  const stepFrames = buildStepFrames({
    seedFrame: win.seedFrame,
    targetFrame: win.target,
    fps,
    maxSteps: params.maxSteps,
    sampleTimes: params.sampleTimes,
  });
  if (stepFrames.length === 0) {
    return fail("common_frame_invalid_target", "no step frame between seed and target");
  }

  return {
    ok: true,
    targetFrame: win.target,
    characterId: win.cid,
    seedFrame: win.seedFrame,
    seedBbox: win.seed.bbox,
    seedSimilarity: win.seed.similarity ?? null,
    stepFrames,
    targetRecords,
    // Intermediates get the centres that are identity-bound AT THE SEED
    // frame — the same static-sibling discipline the production V452 tracker
    // already applies across a whole turn. Nothing is fabricated for a
    // sibling that was not resolved there.
    seedSiblingCenters: [...byFrame.get(win.seedFrame)!.entries()]
      .filter(([cid]) => cid !== win.cid)
      .map(([, r]) => centerOf(r.bbox)),
    // The final step is stricter: the real, contemporaneous cast at T.
    targetSiblingCenters: targetRecords.map((r) => centerOf(r.bbox)),
  };
}

/**
 * V526-B — the step frames.
 *
 * Intermediates come from the production sampler over the seed→target
 * interval; the exact target is appended last, because the sampler's 5 %
 * padding would otherwise stop just short of it and "almost T" is not T.
 *
 * Strictly increasing, strictly inside (S, T) except the final entry, capped
 * at `maxSteps` in total. Never a frame-by-frame scan.
 */
export function buildStepFrames(params: {
  seedFrame: number;
  targetFrame: number;
  fps: number;
  maxSteps: number;
  sampleTimes: (startSec: number, endSec: number, n: number) => number[];
}): number[] {
  const S = Math.round(Number(params.seedFrame));
  const T = Math.round(Number(params.targetFrame));
  const fps = Number(params.fps);
  if (!Number.isFinite(S) || !Number.isFinite(T) || T <= S) return [];
  if (!Number.isFinite(fps) || fps <= 0) return [];
  const cap = Math.max(1, Math.round(Number(params.maxSteps) || 1));

  const out: number[] = [];
  if (cap > 1) {
    const times = params.sampleTimes(S / fps, T / fps, cap - 1) ?? [];
    for (const t of times) {
      const f = Math.round(Number(t) * fps);
      if (!Number.isFinite(f)) continue;
      if (f <= S || f >= T) continue;
      if (out.includes(f)) continue;
      out.push(f);
    }
    out.sort((a, b) => a - b);
    while (out.length > cap - 1) out.pop();
  }
  out.push(T);
  return out;
}

export interface CommonFrameStep {
  frame: number;
  candidateCount: number;
  accepted: boolean;
  reason: string;
  iou: number | null;
}

export interface CommonFrameResult {
  ok: boolean;
  reason?: CommonFrameFailure;
  detail?: string;
  /** The complete same-frame cohort. Empty unless ok. */
  records: PlateNativeIdentityRecord[];
  targetFrame: number | null;
  characterId: string | null;
  seedFrame: number | null;
  /** Bounded, at most `maxSteps` rows. */
  steps: CommonFrameStep[];
  completedSteps: number;
}

/**
 * V526-B — walk the seed forward to the target, then assemble the cohort.
 *
 * `pick` is `pickAssignedFace`, unchanged and unrelaxed. Its thresholds are
 * the reason this can fail over a long interval, and relaxing them for
 * distance would trade away the very rule that stops one cast member being
 * handed another's face.
 *
 * `detectAtFrame` acquires a still through the V525 source-fenced cache and
 * returns candidates already mapped into plate coordinates.
 */
export async function completeCommonFrameCohort(params: {
  plan: CommonFramePlan;
  fence: CommonFrameFence;
  registeredAt: string;
  detectAtFrame: (frame: number) => Promise<{
    ok: boolean;
    candidates: Array<{ bbox: Box; mouth: [number, number] | null }>;
    reason?: string | null;
  }>;
  pick: (
    candidates: Array<{ bbox: Box; mouth: [number, number] | null }>,
    reference: Box,
    siblingCenters: Array<[number, number]>,
    referenceMouth?: [number, number] | null,
  ) => { bbox: Box; mouth: [number, number] | null; iou: number } | null;
}): Promise<CommonFrameResult> {
  const p = params.plan;
  const steps: CommonFrameStep[] = [];
  const base: CommonFrameResult = {
    ok: false,
    records: [],
    targetFrame: p?.targetFrame ?? null,
    characterId: p?.characterId ?? null,
    seedFrame: p?.seedFrame ?? null,
    steps,
    completedSteps: 0,
  };
  const fail = (reason: CommonFrameFailure, detail?: string): CommonFrameResult => ({
    ...base,
    reason,
    detail,
    completedSteps: steps.filter((s) => s.accepted).length,
  });

  if (!p?.ok || !p.stepFrames?.length || !isFiniteBox(p.seedBbox) || !p.characterId) {
    return fail(p?.reason ?? "common_frame_invalid_target", p?.detail ?? "no usable plan");
  }
  const T = Number(p.targetFrame);

  let reference: Box = p.seedBbox;
  let referenceMouth: [number, number] | null = null;

  for (const frame of p.stepFrames) {
    const isTarget = frame === T;
    // Intermediates carry the seed-frame cast; the final step carries the
    // real, contemporaneous one at T.
    const siblings = isTarget
      ? (p.targetSiblingCenters ?? [])
      : (p.seedSiblingCenters ?? []);

    const got = await params.detectAtFrame(frame);
    if (!got?.ok) {
      steps.push({ frame, candidateCount: 0, accepted: false, reason: String(got?.reason ?? "acquire_failed"), iou: null });
      return fail("common_frame_track_broken", `frame ${frame}: ${got?.reason ?? "acquire_failed"}`);
    }
    const candidates = (got.candidates ?? []).filter((c) => isFiniteBox(c?.bbox));
    const picked = params.pick(candidates, reference, siblings, referenceMouth);
    if (!picked) {
      steps.push({
        frame,
        candidateCount: candidates.length,
        accepted: false,
        reason: "no_identity_safe_match",
        iou: null,
      });
      // At the target the same refusal means something sharper: the only
      // plausible continuation was one of the cast already standing there.
      return isTarget
        ? fail("common_frame_sibling_conflict", `frame ${frame}: no candidate survives the target cast`)
        : fail("common_frame_ambiguous_step", `frame ${frame}: continuity not provable`);
    }
    steps.push({
      frame,
      candidateCount: candidates.length,
      accepted: true,
      reason: "ok",
      iou: Number(picked.iou.toFixed(3)),
    });
    reference = picked.bbox;
    if (picked.mouth) referenceMouth = picked.mouth;
  }

  const completed = steps.filter((s) => s.accepted).length;
  const direct = (p.targetRecords ?? []).filter((r) => Number(r.frameNumber) === T);
  const propagated: PlateNativeIdentityRecord = {
    characterId: p.characterId,
    bbox: reference,
    frameNumber: T,
    plateDims: { ...params.fence.plateDims },
    source: "plate_native",
    // Never claim a CompareFaces at the target that never happened.
    identityEvidence: "biometric_seed_plus_identity_locked_track",
    similarity: null,
    seedFrameNumber: p.seedFrame ?? null,
    seedSimilarity: p.seedSimilarity ?? null,
    trackStepCount: completed,
    trackSource: "identity_locked_continuity",
    baseVideoUrl: params.fence.baseVideoUrl,
    sceneId: params.fence.sceneId,
    runId: params.fence.runId,
    plateGeneration: params.fence.plateGeneration,
    registeredAt: params.registeredAt,
  };

  const records = [...direct, propagated];
  const cids = new Set(records.map((r) => stripCharacterIdPrefix(r.characterId)));
  if (cids.size !== records.length) {
    return fail("common_frame_sibling_conflict", "duplicate characterId in the completed cohort");
  }
  if (!records.every((r) => Number(r.frameNumber) === T)) {
    return fail("common_frame_invalid_target", "cohort is not homogeneous");
  }

  return {
    ok: true,
    records,
    targetFrame: T,
    characterId: p.characterId,
    seedFrame: p.seedFrame ?? null,
    steps,
    completedSteps: completed,
  };
}

/** V526-B — bounded telemetry. Scalars and at most `maxSteps` step rows. */
export function buildCommonFrameTelemetry(
  plan: CommonFramePlan,
  result: CommonFrameResult | null,
): Record<string, unknown> {
  return {
    attempted: true,
    target_frame: plan.targetFrame ?? null,
    character_id: plan.characterId ?? null,
    seed_frame: plan.seedFrame ?? null,
    seed_similarity: plan.seedSimilarity ?? null,
    step_frames: plan.stepFrames ?? [],
    completed_steps: result?.completedSteps ?? 0,
    result: result?.ok ? "completed" : "failed",
    reason: result?.reason ?? plan.reason ?? null,
    detail: result?.detail ?? plan.detail ?? null,
    steps: (result?.steps ?? []).map((s) => ({
      frame: s.frame,
      candidates: s.candidateCount,
      accepted: s.accepted,
      reason: s.reason,
      iou: s.iou,
    })),
  };
}
