/**
 * V469 — frozen regression suite for the pre-dispatch mouth-visibility gate.
 * Every case below is a clause of the V469 authorization.
 *
 * Authorized regression matrix (S01, scene be60d106…):
 *   P0  ~90° profile, mouth barely visible      → BLOCK
 *   P1  frontal                                 → PASS
 *   P2  MOVED                                   → PASS
 *   P4  MOVED                                   → PASS
 *   historical ~75° yaw MOVED (V463)            → PASS (mouth visible)
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  evaluateV469MouthVisibility,
  V469_MIN_EVALUATED_FRAMES,
  type V469TrackSample,
} from "./v469-mouth-visibility-gate.ts";

/** Build a synthetic track: face box of the given aspect, optional mouth. */
function track(opts: {
  frames?: number;
  aspect: number;
  /** fraction of frames that carry a mouth landmark */
  mouthRate?: number;
  /** place the mouth on the occluded silhouette edge instead of inside */
  mouthOnEdge?: boolean;
}): V469TrackSample[] {
  const frames = opts.frames ?? 16;
  const h = 200;
  const w = h * opts.aspect;
  const mouthRate = opts.mouthRate ?? 1;
  const out: V469TrackSample[] = [];
  for (let i = 0; i < frames; i++) {
    const x1 = 400 + i * 2;
    const y1 = 300;
    const box: [number, number, number, number] = [x1, y1, x1 + w, y1 + h];
    const hasMouth = i / frames < mouthRate;
    const mouth: [number, number] | null = hasMouth
      ? opts.mouthOnEdge
        ? [x1 + w * 0.995, y1 + h * 0.78]
        : [x1 + w * 0.5, y1 + h * 0.78]
      : null;
    out.push({ t: 1 + i / 30, box, mouth });
  }
  return out;
}

Deno.test("P0 — ~90° profile, mouth not usably visible → BLOCK", () => {
  const r = evaluateV469MouthVisibility({
    usePreclip: true,
    anchor: "face-fallback",
    yawDeg: 88,
    faceTrack: track({ aspect: 0.34, mouthRate: 0.2, mouthOnEdge: true }),
  });
  assertEquals(r.status, "block");
  assertEquals(r.ok, false);
  assertEquals(r.code, "preclip_mouth_not_visible");
});

Deno.test("P1 — frontal → PASS", () => {
  const r = evaluateV469MouthVisibility({
    usePreclip: true,
    anchor: "mouth-centered",
    yawDeg: 8,
    faceTrack: track({ aspect: 0.82 }),
  });
  assertEquals(r.status, "pass");
});

Deno.test("P2 — MOVED cohort → PASS", () => {
  const r = evaluateV469MouthVisibility({
    usePreclip: true,
    anchor: "mouth-centered",
    yawDeg: 25,
    faceTrack: track({ aspect: 0.74 }),
  });
  assertEquals(r.status, "pass");
});

Deno.test("P4 — MOVED cohort → PASS", () => {
  const r = evaluateV469MouthVisibility({
    usePreclip: true,
    anchor: "mouth-centered",
    yawDeg: 40,
    faceTrack: track({ aspect: 0.63, mouthRate: 0.9 }),
  });
  assertEquals(r.status, "pass");
});

Deno.test("V463 proof — ~75° yaw with a visible mouth must NOT be blocked", () => {
  const r = evaluateV469MouthVisibility({
    usePreclip: true,
    anchor: "mouth-centered",
    yawDeg: 75,
    faceTrack: track({ aspect: 0.52 }),
  });
  assertEquals(r.status, "pass");
  assertEquals(r.metrics.yaw_risk, true); // risk signal only, never a decision
});

Deno.test("yaw alone never blocks (yaw 89°, mouth clearly visible)", () => {
  const r = evaluateV469MouthVisibility({
    usePreclip: true,
    anchor: "mouth-centered",
    yawDeg: 89,
    faceTrack: track({ aspect: 0.7 }),
  });
  assertEquals(r.status, "pass");
});

Deno.test("fail-open — no face track at all", () => {
  const r = evaluateV469MouthVisibility({ usePreclip: true, faceTrack: null });
  assertEquals(r.status, "unevaluated");
  assertEquals(r.ok, true);
});

Deno.test("fail-open — fewer samples than the evidence floor", () => {
  const r = evaluateV469MouthVisibility({
    usePreclip: true,
    faceTrack: track({ frames: V469_MIN_EVALUATED_FRAMES - 1, aspect: 0.3, mouthRate: 0 }),
  });
  assertEquals(r.status, "unevaluated");
  assertEquals(r.ok, true);
});

Deno.test("full-plate dispatch → skipped", () => {
  const r = evaluateV469MouthVisibility({ usePreclip: false });
  assertEquals(r.status, "skipped");
  assertEquals(r.ok, true);
});

Deno.test("input mouth/frame ratio is telemetry only, never gating", () => {
  const r = evaluateV469MouthVisibility({
    usePreclip: true,
    anchor: "mouth-centered",
    yawDeg: 10,
    inputMouthOverFrame: 0.51, // P1 value — documented, must not block
    faceTrack: track({ aspect: 0.8 }),
  });
  assertEquals(r.status, "pass");
  assertEquals(r.metrics.input_mouth_over_frame, 0.51);
});

Deno.test("turn window limits the evaluated frames", () => {
  const r = evaluateV469MouthVisibility({
    usePreclip: true,
    anchor: "mouth-centered",
    faceTrack: track({ aspect: 0.8, frames: 30 }),
    turnStartSec: 1.0,
    turnEndSec: 1.4,
  });
  assertEquals(r.metrics.evaluated_frames, 13);
  assertEquals(r.status, "pass");
});
