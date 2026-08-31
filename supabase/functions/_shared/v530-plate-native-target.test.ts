/**
 * V530 — PLATE-NATIVE TARGET FRAME AUTHORITY + STILL_FPS RECONCILIATION.
 *
 * Generation 28: V528 delivered a 1284x718 plate raster, V529/V524 registered
 * all four characters on frame 23 — Sarah at [240,116,335,254], similarity
 * 97.62 — and V523 then refused her at the repair frame.
 *
 * The persisted `frame_face_cache` row names the validator:
 * google/gemini-2.5-flash. The reference was an AWS DetectFaces box on the
 * V528 still; the candidates were boxes a language model estimated. Sarah's
 * face is 95x138. The candidate is 321x431 — 10.55x the area, IoU 0.0948,
 * centre 152 px away. Both continuation gates refused, correctly.
 *
 * The arithmetic was right and the two boxes are measurements of different
 * things. These tests pin the measurement authority, not the thresholds.
 */
import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  pickAssignedFace,
  STILL_FPS,
  stillBoxToSource,
  TRACK_AMBIGUITY_DIST_RATIO,
  TRACK_AMBIGUITY_IOU_DELTA,
  TRACK_MAX_CENTER_DRIFT,
  TRACK_MIN_IOU,
  TRACK_MOUTH_TIEBREAK_MARGIN,
} from "./plate-face-track.ts";

type Box = [number, number, number, number];

const DISPATCHER = "./supabase/functions/compose-dialog-segments/index.ts";
const PLATE = { width: 1284, height: 718 };
/** Sarah, AWS CompareFaces on the V528 still, frame 23. */
const SARAH: Box = [240, 116, 335, 254];
const ASSUMED_FPS = 24;

/** The actual Gen28 boxes google/gemini-2.5-flash returned for frame 54. */
const GEN28_GEMINI = [
  { x: 0.05, y: 0.15, w: 0.25, h: 0.60, confidence: 0.98 },
  { x: 0.32, y: 0.15, w: 0.25, h: 0.60, confidence: 0.98 },
  { x: 0.58, y: 0.15, w: 0.25, h: 0.60, confidence: 0.98 },
  { x: 0.82, y: 0.15, w: 0.18, h: 0.45, confidence: 0.95 },
];

const denorm = (b: { x: number; y: number; w: number; h: number }): Box => [
  Math.round(b.x * PLATE.width),
  Math.round(b.y * PLATE.height),
  Math.round((b.x + b.w) * PLATE.width),
  Math.round((b.y + b.h) * PLATE.height),
];
const areaOf = (b: Box) => (b[2] - b[0]) * (b[3] - b[1]);
const centerOf = (b: Box): [number, number] => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];

// ═══ PARTS 6/8 — the clock ═════════════════════════════════════════

Deno.test("V530 — the still authority is the exported STILL_FPS, not a new constant", async () => {
  assertEquals(STILL_FPS, 30);
  const src = await Deno.readTextFile(DISPATCHER);
  assert(src.includes("const v530Frame = Math.max(0, Math.round(v530SampleSec * STILL_FPS));"));
  // No private fps for V523.
  assertEquals(/const V523_FPS/.test(src), false);
  assertEquals(/const V530_FPS/.test(src), false);
  // And no hardcoded Gen28 answer.
  assertEquals(/v530Frame\s*=\s*68/.test(src), false);
});

Deno.test("V530 — 24→30 reconciliation preserves TIME, not the frame index", () => {
  const toStill = (gateFrame: number) => Math.max(0, Math.round((gateFrame / ASSUMED_FPS) * STILL_FPS));
  // Gen28's own repair frame.
  assertEquals(54 / ASSUMED_FPS, 2.25);
  assertEquals(toStill(54), 68);
  assertEquals(68 / STILL_FPS, 2.2666666666666666);
  // The naive alternative — reading 54 as a 30-fps frame — would move the
  // sample 0.45 s earlier. That is the bug this conversion avoids.
  assertNotEquals(54 / STILL_FPS, 54 / ASSUMED_FPS);
  assert(Math.abs(54 / STILL_FPS - 54 / ASSUMED_FPS) > 0.4);
  // Across a representative sweep the time error is bounded by one
  // 30-fps quantisation step and nothing else.
  for (let f = 0; f <= 600; f++) {
    const before = f / ASSUMED_FPS;
    const after = toStill(f) / STILL_FPS;
    assert(
      Math.abs(after - before) <= 0.5 / STILL_FPS + 1e-9,
      `gate frame ${f}: ${before}s → ${after}s`,
    );
  }
});

Deno.test("V530 — the rounding is the project's canonical one", async () => {
  const src = await Deno.readTextFile(DISPATCHER);
  // `uniqueSortedFrames` uses Math.max(0, Math.round(n)); V526-A uses the
  // same. V530 does not invent a third rule.
  assert(src.includes("Math.max(0, Math.round(n))"), "uniqueSortedFrames unchanged");
  assert(src.includes("Math.max(0, Math.round(v530SampleSec * STILL_FPS))"));
});

// ═══ PARTS 9/20 — the Gen28 fixture ════════════════════════════════

Deno.test("V530 — the Gen28 Gemini boxes reproduce the persisted failure exactly", () => {
  const c0 = denorm(GEN28_GEMINI[0]);
  // This is verbatim the persisted `positional_would_have`.
  assertEquals(c0, [64, 108, 385, 539]);
  assertEquals(areaOf(c0) / areaOf(SARAH), 138351 / 13110);
  assert(Math.abs(areaOf(c0) / areaOf(SARAH) - 10.55) < 0.01);
  // A "face" spanning 60% of the frame height, 1.5 s after a 19.2% one.
  // Corner rounding, so a tolerance on the ratio rather than on the box.
  assert(Math.abs((c0[3] - c0[1]) / PLATE.height - 0.6) < 0.001);
  assert(Math.abs((SARAH[3] - SARAH[1]) / PLATE.height - 0.192) < 0.001);
  // And the picker refuses every one of the four, under UNCHANGED thresholds.
  const asCandidates = GEN28_GEMINI.map((b) => ({ bbox: denorm(b), mouth: null }));
  assertEquals(pickAssignedFace(asCandidates, SARAH, []), null);
});

Deno.test("V530 — no Gemini or MediaPipe geometry reaches the V523 authority", async () => {
  const src = await Deno.readTextFile(DISPATCHER);
  // The authoritative call takes the plate-native set and nothing else.
  assert(src.includes("candidates: v530.candidates,"), "V523 must receive the AWS set");
  // The retired wiring is gone: `sortedBoxes` no longer feeds the repair.
  const call = src.slice(src.indexOf("v523Repair = resolveIdentityLockedRepair({"));
  const block = call.slice(0, call.indexOf("});") + 3);
  assertEquals(block.includes("sortedBoxes"), false, "Gemini boxes must not reach V523");
  assertEquals(block.includes("Number(b.x) * plateDims"), false, "no validate-frame-face denorm");
  // `sortedBoxes` survives only for the legacy face-count/telemetry use.
  assert(src.includes("face_count: sortedBoxes.length,"));
});

// ═══ PARTS 2/3/4/5 — the new acquisition ═══════════════════════════

Deno.test("V530 — the target still comes through V525, with no second path", async () => {
  const src = await Deno.readTextFile(DISPATCHER);
  assert(src.includes("const got = await v525Acquire(frameNumber);"), "target uses v525Acquire");
  // Still exactly ONE call site into the extractor: no second cache namespace.
  assertEquals((src.match(/await extractPlateFrame\(\{/g) ?? []).length, 1);
  // Raster provenance is carried out of the acquisition.
  assert(src.includes("got.requestedRaster"));
  assert(src.includes("got.actualRaster"));
});

Deno.test("V530 — the target detector is the existing AWS one", async () => {
  const src = await Deno.readTextFile(DISPATCHER);
  assert(src.includes("const v530Detect = (() => {"));
  assert(src.includes("return defaultDetectFaces();"));
  assert(src.includes("const faces = await v530Detect(bytes, img.width, img.height, 20_000);"));
  // Same conversion the turn tracker and V526-B use, no new geometry.
  assert(src.includes("bbox: stillBoxToSource("));
  assertEquals(typeof stillBoxToSource, "function");
});

Deno.test("V530 — stillBoxToSource maps a still box into plate pixels", () => {
  // Identity case: still raster equals plate raster (the V528 guarantee).
  const b: Box = [240, 116, 335, 254];
  assertEquals(
    stillBoxToSource(b, PLATE.width, PLATE.height, PLATE.width, PLATE.height),
    b,
  );
  // A larger still is scaled down into plate pixels, not reinterpreted.
  const scaled = stillBoxToSource([480, 232, 670, 508], PLATE.width, PLATE.height, 2568, 1436);
  assertEquals(scaled, b);
});

Deno.test("V530 — acquisition failure fails closed, with no fallback", async () => {
  const src = await Deno.readTextFile(DISPATCHER);
  const gate = src.indexOf("if (!v530.ok) {");
  assert(gate > 0, "there must be an explicit closed gate");
  const block = src.slice(gate, src.indexOf("} else {", gate));
  assert(block.includes('reason: "identity_unresolved"'));
  assert(block.includes("detail: v530.reason"), "first cause must survive");
  assertEquals(block.includes("sortedBoxes"), false, "no Gemini fallback");
  assertEquals(block.includes("positionalWouldHavePicked: null"), true, "no positional fallback");
  // The bounded first causes exist and are distinct.
  for (
    const r of [
      "v530_plate_dims_unavailable",
      "v530_detector_unavailable",
      "v530_target_still_failed:",
      "v530_target_still_http_",
      "v530_target_detect_failed:",
    ]
  ) {
    assert(src.includes(r), `missing bounded reason ${r}`);
  }
});

// ═══ PART 21 — a same-detector candidate under unchanged thresholds ══

Deno.test("V530 — an AWS-shaped candidate near the reference is accepted", () => {
  // Sarah 1.5 s later: same detector, a plausible shift and a slight scale
  // change. Nothing about the picker changed; it simply now receives a
  // measurement of the same kind.
  const sarahLater: Box = [252, 124, 350, 266];
  const picked = pickAssignedFace([{ bbox: sarahLater, mouth: null }], SARAH, []);
  assert(picked !== null, "a commensurable candidate must be provable");
  assertEquals(picked!.bbox, sarahLater);
  assert(picked!.iou >= TRACK_MIN_IOU, `iou ${picked!.iou}`);
});

Deno.test("V530 — a clearly wrong sibling is still rejected", () => {
  const sarahLater: Box = [252, 124, 350, 266];
  // Samuel, far to the right, with Samuel's locked centre as the sibling veto.
  const samuelLater: Box = [820, 130, 915, 268];
  const samuelCenter = centerOf([812, 122, 907, 260]);
  // On its own the far face fails the acceptance gate outright.
  assertEquals(pickAssignedFace([{ bbox: samuelLater, mouth: null }], SARAH, []), null);
  // In the full set Sarah is still the one picked, and the veto does not
  // steal her.
  const picked = pickAssignedFace(
    [{ bbox: sarahLater, mouth: null }, { bbox: samuelLater, mouth: null }],
    SARAH,
    [samuelCenter],
  );
  assertEquals(picked?.bbox, sarahLater);
});

Deno.test("V530 — sibling references stay the V524 frame-23 cohort", async () => {
  const src = await Deno.readTextFile(DISPATCHER);
  // Unchanged: siblings come from the plate-native records, not from the
  // repair-frame candidates.
  assert(src.includes("const sibPlate = v524TargetIsPlateNative"));
  assert(src.includes("siblingCenters: v523Siblings,"));
  assert(src.includes("siblingReferences: v523SiblingRefs,"));
});

// ═══ PARTS 13/14/15/22/23 — what V530 deliberately does NOT do ═════

Deno.test("V530 — every continuation threshold is untouched", () => {
  assertEquals(TRACK_MIN_IOU, 0.15);
  assertEquals(TRACK_MAX_CENTER_DRIFT, 0.7);
  assertEquals(TRACK_AMBIGUITY_DIST_RATIO, 1.15);
  assertEquals(TRACK_AMBIGUITY_IOU_DELTA, 0.05);
  assertEquals(TRACK_MOUTH_TIEBREAK_MARGIN, 0.25);
});

Deno.test("V530 — no CompareFaces, no seed search, no temporal bridge added", async () => {
  const src = await Deno.readTextFile(DISPATCHER);
  const helper = src.slice(
    src.indexOf("const v530TargetFaces = async"),
    src.indexOf("const v524Needed ="),
  );
  assertEquals(helper.includes("resolveIdentityViaRekognition"), false, "DetectFaces only");
  assertEquals(helper.includes("CompareFaces"), false);
  assertEquals(helper.includes("planCommonFrameCompletion"), false, "no bridging");
  assertEquals(helper.includes("buildStepFrames"), false, "no bridging");
  // The mouth stays null exactly as V526-B leaves it — the V456 tiebreak is
  // unreachable here and V530 does not pretend otherwise.
  assert(helper.includes("mouth: null,"));
});

Deno.test("V530 — the frozen neighbours are untouched", async () => {
  const v523 = await Deno.readTextFile("./supabase/functions/_shared/v523-identity-repair.ts");
  assert(v523.includes("export function resolveIdentityLockedRepair(params: {"));
  assert(v523.includes('reason: "identity_contested"'));
  const track = await Deno.readTextFile("./supabase/functions/_shared/plate-face-track.ts");
  assert(track.includes("if (iou < TRACK_MIN_IOU && dist > rSide * TRACK_MAX_CENTER_DRIFT) continue;"));
  const resolver = await Deno.readTextFile("./supabase/functions/_shared/resolveIdentityViaRekognition.ts");
  assert(resolver.includes("const ASSIGN_NODE_BUDGET = 200_000;"), "V529-P0 intact");
  assert(resolver.includes("const MIN_SIMILARITY = 55;"), "V529 thresholds intact");
  const v525 = await Deno.readTextFile("./supabase/functions/_shared/v525-plate-frame-extract.ts");
  assert(v525.includes("export function resolvePlateRaster("), "V528 intact");
});

// ═══ PARTS 16/17/19 — cost, cache, telemetry ═══════════════════════

Deno.test("V530 — the repair-frame budget is bounded by the existing candidate list", async () => {
  const src = await Deno.readTextFile(DISPATCHER);
  const fn = src.slice(
    src.indexOf("function frameCandidatesForTurn("),
    src.indexOf("function frameCandidatesForTurn(") + 900,
  );
  // Five sample points, deduplicated — the hard upper bound per pass.
  const points = fn.slice(fn.indexOf("const points = ["), fn.indexOf("];", fn.indexOf("const points = [")));
  assertEquals(points.split("\n").filter((l) => l.trim().length > 0).length - 1, 5);
  assert(fn.includes("uniqueSortedFrames("));
  // No scan, no widening.
  assertEquals(/for\s*\(\s*let\s+f\s*=\s*0;\s*f\s*<\s*total/.test(src), false);
});

Deno.test("V530 — bounded telemetry names the picture, the clock and the detector", async () => {
  const src = await Deno.readTextFile(DISPATCHER);
  for (
    const field of [
      "gate_frame:",
      "fps_authority: STILL_FPS,",
      "sample_time_sec:",
      "still_frame:",
      'candidate_source: "plate_native_aws_detect_faces"',
      "candidate_count:",
      "still_cache_hit:",
      "requested_raster:",
      "actual_raster:",
    ]
  ) {
    assert(src.includes(field), `missing telemetry field ${field}`);
  }
  assert(src.includes("v530_target: v530Telemetry,"), "persisted with the repair record");
  // No raw payloads.
  const tel = src.slice(src.indexOf("v530Telemetry = {"), src.indexOf("};", src.indexOf("v530Telemetry = {")));
  assertEquals(tel.includes("bytes"), false);
  assertEquals(tel.includes("candidates:"), false);
});
