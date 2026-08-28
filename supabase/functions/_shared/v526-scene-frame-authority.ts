/**
 * ═══════════════════════════════════════════════════════════════════════════
 * V526-A — SCENE-WIDE FRAME AUTHORITY FOR PLATE IDENTITY REGISTRATION
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Scene 67b392b1, generation 23. V525 extracted three real stills from the
 * durable base video and V524 resolved 3/4 on every one of them — Matthew
 * missing at frames 6 and 8, Kay missing at frame 30. No single frame carried
 * the whole cast, and the registration failed with `incomplete_registration`.
 *
 * The obvious reading is that the 4/4-in-one-frame rule is too strict. The
 * measurement says something else. The three candidates came from
 *
 *     frameCandidatesForTurn(builtPasses[0].segments[0], totalSec, ASSUMED_FPS)
 *
 * — the FIRST TURN of the FIRST PASS. At the renderer's real 30 fps those
 * frames are 0.20 s, 0.27 s and 1.00 s of a fifteen-second plate. All three
 * attempts examined the same single second.
 *
 * That selector was written for a per-pass question: "is this speaker's face
 * visible around their turn?" Registration asks a scene question: "is the
 * whole cast biometrically resolvable anywhere in this plate?" Answering the
 * second with the first is the same shape of error this pipeline has been
 * closing since V516 — a correct computation over the wrong object, here the
 * wrong stretch of time.
 *
 * Two defects, one fix:
 *
 *   TIME  the candidates now span the scene, drawn from the same bounded
 *         `trackSampleTimes` the V452 tracker already uses. Still three.
 *   FPS   the seconds→frame conversion used `ASSUMED_FPS = 24` while the
 *         still renderer runs `DialogStitchVideo` at 30. Every requested
 *         frame was therefore ~20 % earlier than intended — 30 was asked for
 *         and 1.00 s was delivered where 1.25 s was meant.
 *
 * Nothing about identity changes. The registration still demands all four
 * characters in ONE frame; it just stops looking for them in one second.
 */

import { trackSampleTimes } from "./dynamic-camera-path.ts";

/** How the candidate frames were chosen. */
export type SceneFrameSelector = "scene_wide" | "turn_local_fallback";

export type SceneFrameFallbackReason =
  | "invalid_total_sec"
  | "invalid_fps"
  | "no_valid_frames";

export interface SceneFrameSelection {
  selector: SceneFrameSelector;
  /** Frame indices in the still composition's own frame space. */
  frames: number[];
  /** The sampled seconds behind them. Empty on the fallback path. */
  times: number[];
  /** The fps authority actually used for the conversion. */
  fps: number;
  totalSec: number;
  /** Highest frame index the composition can serve, or null on fallback. */
  lastFrame: number | null;
  fallbackReason: SceneFrameFallbackReason | null;
}

/**
 * V526-A — the three registration frames, spread across the scene.
 *
 * `sampleTimes` defaults to the production sampler and is injectable for
 * tests only; there is deliberately no second sampling algorithm. The 5 %
 * interior padding it applies is reused unchanged: the base plate is the raw
 * provider output copied byte-for-byte into the durable path, with no stitch
 * and no fade, so its whole duration is content and no new percentage needs
 * inventing.
 *
 * `turnLocalFallback` is the existing per-pass selector, used ONLY when the
 * scene duration is unusable. Three attempts at frame 0 would be worse than
 * one bad second.
 */
export function selectSceneIdentityFrames(params: {
  totalSec: number;
  /** Canonical fps of the still composition — `STILL_FPS`, never ASSUMED_FPS. */
  fps: number;
  maxFrames: number;
  /** The existing per-pass candidates, for the invalid-duration path only. */
  turnLocalFallback: () => number[];
  sampleTimes?: (startSec: number, endSec: number, n: number) => number[];
}): SceneFrameSelection {
  const maxFrames = Math.max(1, Math.min(3, Math.round(Number(params.maxFrames) || 0)));
  const totalSec = Number(params.totalSec);
  const fps = Number(params.fps);

  const fallback = (reason: SceneFrameFallbackReason): SceneFrameSelection => ({
    selector: "turn_local_fallback",
    frames: dedupeFrames(params.turnLocalFallback() ?? [], null).slice(0, maxFrames),
    times: [],
    fps: Number.isFinite(fps) && fps > 0 ? fps : 0,
    totalSec: Number.isFinite(totalSec) ? totalSec : 0,
    lastFrame: null,
    fallbackReason: reason,
  });

  if (!Number.isFinite(totalSec) || totalSec <= 0) return fallback("invalid_total_sec");
  if (!Number.isFinite(fps) || fps <= 0) return fallback("invalid_fps");

  // The composition's frame space is defined by the duration handed to the
  // renderer — the same `totalSec` the V452 tracker already passes to the same
  // still composition. The last servable index is one below the count.
  const lastFrame = Math.max(0, Math.round(totalSec * fps) - 1);
  const sample = params.sampleTimes ?? trackSampleTimes;
  const times = sample(0, totalSec, maxFrames) ?? [];

  const frames = dedupeFrames(
    times
      .map((t) => Number(t))
      .filter((t) => Number.isFinite(t))
      .map((t) => Math.round(t * fps)),
    lastFrame,
  ).slice(0, maxFrames);

  // A clip too short to yield even one servable frame is not a scene-wide
  // measurement; the per-pass selector at least knows its own turn.
  if (frames.length === 0) return fallback("no_valid_frames");

  return {
    selector: "scene_wide",
    frames,
    times: times.map((t) => Number(t)).filter((t) => Number.isFinite(t)),
    fps,
    totalSec,
    lastFrame,
    fallbackReason: null,
  };
}

/**
 * Clamp into range, drop duplicates, keep ascending order.
 *
 * A very short clip collapses several sampled seconds onto the same index —
 * rendering that frame twice would pay twice for one picture. Degrading to two
 * frames, or to one, is the deterministic answer.
 */
function dedupeFrames(raw: number[], lastFrame: number | null): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const v of raw ?? []) {
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    const clamped = lastFrame === null
      ? Math.max(0, Math.round(n))
      : Math.min(lastFrame, Math.max(0, Math.round(n)));
    if (seen.has(clamped)) continue;
    seen.add(clamped);
    out.push(clamped);
  }
  return out.sort((a, b) => a - b);
}

/** V526-A — bounded selector provenance. Scalars only. */
export function buildSceneFrameTelemetry(s: SceneFrameSelection): Record<string, unknown> {
  return {
    selector: s.selector,
    fps_authority: s.fps,
    total_sec: Number(s.totalSec.toFixed(3)),
    sample_times: s.times.map((t) => Number(t.toFixed(3))),
    candidate_frames: s.frames,
    last_frame: s.lastFrame,
    fallback: s.fallbackReason,
  };
}
