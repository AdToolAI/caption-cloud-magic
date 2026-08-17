import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  assignAnchorsToCandidatesBijective,
  filterPlausibleCandidates,
  plateFaceSanity,
  type CandidateFace,
} from "./plate-face-candidates.ts";

const DIMS = { width: 1284, height: 718 };

type Box = [number, number, number, number];
const cand = (index: number, bbox: Box): CandidateFace => ({
  index,
  bbox,
  cx: (bbox[0] + bbox[2]) / 2 / DIMS.width,
  cy: (bbox[1] + bbox[3]) / 2 / DIMS.height,
});
const anchorOf = (bbox: Box) => ({
  cx: (bbox[0] + bbox[2]) / 2 / DIMS.width,
  cy: (bbox[1] + bbox[3]) / 2 / DIMS.height,
});

// ── S11 regression fixture ────────────────────────────────────────────
const SARAH: Box = [226, 244, 286, 327];
const SAMUEL: Box = [476, 209, 540, 294];
const MATTHEW: Box = [753, 187, 819, 277];
const KAY: Box = [1030, 208, 1099, 296];
// False positives that carried the (wrong) identity labels in the S11 run.
const FP_SARAH: Box = [640, 402, 660, 419];
const FP_MATTHEW: Box = [372, 512, 386, 524];
const FP_KAY: Box = [905, 96, 926, 114];
// Additional background detections (extras).
const EXTRA_1: Box = [100, 640, 118, 660];
const EXTRA_2: Box = [1200, 60, 1216, 78];
const EXTRA_3: Box = [40, 40, 58, 60];

const S11_DETECTED: Box[] = [
  SARAH, SAMUEL, MATTHEW, KAY,
  FP_SARAH, FP_MATTHEW, FP_KAY,
  EXTRA_1, EXTRA_2, EXTRA_3,
];

function route(detected: Box[], anchors: Box[]) {
  const candidates = detected.map((b, i) => cand(i, b));
  const { plausible, rejected } = filterPlausibleCandidates(candidates, DIMS);
  const res = assignAnchorsToCandidatesBijective(anchors.map(anchorOf), plausible.map((p) => ({ cx: p.cx, cy: p.cy })));
  return { plausible, rejected, res };
}

Deno.test("S11: tiny false positives are dropped before assignment", () => {
  const { plausible, rejected } = route(S11_DETECTED, [SARAH, SAMUEL, MATTHEW, KAY]);
  assertEquals(plausible.map((p) => p.index), [0, 1, 2, 3]);
  assertEquals(rejected.every((r) => r.reason === "area_too_small"), true);
});

Deno.test("S11: bijective geometry assignment picks the four real faces", () => {
  const anchors = [SARAH, SAMUEL, MATTHEW, KAY];
  const { plausible, res } = route(S11_DETECTED, anchors);
  assertEquals(res.ok, true);
  assertEquals(res.assign.map((c) => plausible[c].bbox), anchors);
});

Deno.test("S11: candidate order is result-neutral", () => {
  const anchors = [SARAH, SAMUEL, MATTHEW, KAY];
  const shuffled = [...S11_DETECTED].reverse();
  const { plausible, res } = route(shuffled, anchors);
  assertEquals(res.ok, true);
  assertEquals(res.assign.map((c) => plausible[c].bbox), anchors);
});

Deno.test("S11: no plate face is used twice", () => {
  const { res } = route(S11_DETECTED, [SARAH, SAMUEL, MATTHEW, KAY]);
  assertEquals(new Set(res.assign).size, res.assign.length);
});

Deno.test("N=1 / N=2 / N=4 with extras still resolve", () => {
  for (const anchors of [[SARAH], [SARAH, KAY], [SARAH, SAMUEL, MATTHEW, KAY]]) {
    const { plausible, res } = route(S11_DETECTED, anchors as Box[]);
    assertEquals(res.ok, true);
    assertEquals(res.assign.map((c) => plausible[c].bbox), anchors);
  }
});

Deno.test("too few plausible candidates → fail-closed count_mismatch (B.1a)", () => {
  const { res } = route([SARAH, SAMUEL, FP_KAY, FP_MATTHEW], [SARAH, SAMUEL, MATTHEW]);
  assertEquals(res.ok, false);
  assertEquals(res.reason, "count_mismatch");
});

Deno.test("exactly identical candidate centers → fail-closed (B.1c)", () => {
  const twin: Box = [SARAH[0], SARAH[1], SARAH[2], SARAH[3]];
  const { res } = route([SARAH, twin, SAMUEL], [SARAH, SAMUEL]);
  assertEquals(res.ok, false);
  assertEquals(res.reason, "degenerate_candidate_centers");
});

Deno.test("exact equal-cost ambiguity → fail-closed (B.1c)", () => {
  // Two anchors sitting exactly between two mirrored candidates: both
  // bijections have exactly the same total cost.
  const a: Box = [200, 200, 280, 300];
  const b: Box = [1000, 200, 1080, 300];
  const anchors = [
    { cx: 0.5, cy: (250 / DIMS.height) },
    { cx: 0.5, cy: (250 / DIMS.height) },
  ];
  const candidates = [cand(0, a), cand(1, b)];
  const res = assignAnchorsToCandidatesBijective(anchors, candidates.map((c) => ({ cx: c.cx, cy: c.cy })));
  assertEquals(res.ok, false);
  assertEquals(res.reason, "equal_cost_ambiguity");
});

Deno.test("high-confidence tiny box can never win — confidence is not an input", () => {
  // The API takes geometry only; there is no confidence parameter at all.
  const { plausible } = route([FP_MATTHEW, MATTHEW], [MATTHEW]);
  assertEquals(plausible.length, 1);
  assertEquals(plausible[0].bbox, MATTHEW);
});

Deno.test("unlabeled correct geometry wins over labeled wrong geometry", () => {
  // Labels are not part of the API surface: only the plausible geometry
  // remains, so the unlabeled real face is assigned.
  const { plausible, res } = route([FP_KAY, KAY], [KAY]);
  assertEquals(res.ok, true);
  assertEquals(plausible[res.assign[0]].bbox, KAY);
});

Deno.test("sanity limits match the production thresholds", () => {
  assertEquals(plateFaceSanity([0, 0, 0, 0], DIMS).reason, "degenerate");
  assertEquals(plateFaceSanity([0, 0, 1284, 718], DIMS).reason, "area_too_large");
  assertEquals(plateFaceSanity([10, 10, 20, 18], DIMS).reason, "area_too_small");
  assertEquals(plateFaceSanity([100, 100, 400, 180], DIMS).reason, "aspect_invalid");
  assertEquals(plateFaceSanity([1280, 700, 1600, 1100], DIMS).reason, "out_of_plate");
  assertEquals(plateFaceSanity(SARAH, DIMS).ok, true);
});
