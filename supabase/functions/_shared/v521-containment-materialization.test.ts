/**
 * V521 — DYNAMIC CONTAINMENT RESULT MATERIALIZATION
 *
 * Scene 67b392b1, generation 18, pass 0 (Sarah Dusatko). Everything worked:
 * strict identity 4/4, a durable gen-18 base, the pre-clip rendered at
 * 68,327,154 over 82 frames, the V452 track was 6/6 valid, and the V519
 * dynamic proof passed with checked = 6. The pass terminalized anyway, on
 * `bbox_zero_voiced_frames` — a diagnostic about a speaker who was visible the
 * entire time.
 *
 * The cause was mine, in V519. `evaluatePreclipCropContainment` returns EARLY
 * at E.1, and an early return carries no `clipBox`. V519 merged a dynamic
 * success as `{ ...failedStaticResult, ok: true }`, so `clipBox` stayed
 * `undefined` and `containment.clipBox!` asserted a value that did not exist at
 * runtime. The dispatch box vanished, the canonical box array came out empty,
 * and the zero-voiced-frames branch claimed the blame.
 *
 * The early return also skipped E.4 and E.3, and the override then declared
 * success — so a dynamic pass could bypass the sibling identity check.
 *
 *   PURE     — executes the decision logic.
 *   CONTRACT — asserts wiring no unit test can reach.
 */

import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  evaluateDynamicPreclipContainment,
  evaluatePreclipCropContainment,
  finalizePreclipContainment,
} from "./preclip-crop-containment.ts";
import { cameraPathContainsAll } from "./pass-face-preclip.ts";

type Box = [number, number, number, number];

// ── The generation-18 Sarah geometry, exactly as production held it ──────
/** Contract-E / planner target, PLATE pixels. */
const TARGET: Box = [118, 324, 302, 451];
/** The pre-clip that actually rendered: x=68 y=327 size=154. */
const CROP = { x: 68, y: 327, size: 154, outputSize: 720 };
const START_SEC = 0;
const KEYFRAMES = [
  { t: 0.0, x: 68, y: 320, size: 200 },
  { t: 1.0, x: 80, y: 330, size: 200 },
  { t: 2.0, x: 95, y: 340, size: 200 },
];
const TRACK = [
  { t: 0.0, box: [118, 324, 250, 451] },
  { t: 1.0, box: [130, 334, 262, 461] },
  { t: 2.0, box: [145, 344, 277, 471] },
];

const dynamic = () =>
  evaluateDynamicPreclipContainment({
    cameraPathDynamic: true,
    keyframes: KEYFRAMES,
    trackSamples: TRACK,
    startSec: START_SEC,
    containsAll: cameraPathContainsAll,
  } as never);

// ═══ Part 10 — the generation-18 fixture ═════════════════════════════════
Deno.test("PURE — 1. static E.1 still fails, and carries NO clipBox", () => {
  const stat = evaluatePreclipCropContainment({
    crop: CROP,
    targetBbox: TARGET,
    otherSpeakerCenters: [],
  });
  assertEquals(stat.ok, false);
  assertEquals(stat.reason, "target_not_contained_in_crop");
  // The whole defect in one assertion: a failed static result has no box.
  assertEquals(stat.clipBox, undefined);
  // …so the V519 merge produced exactly this.
  const v519Merge = { ...stat, ok: true, reason: undefined };
  assertEquals(v519Merge.ok, true);
  assertEquals(v519Merge.clipBox, undefined, "ok:true with no box — the generation-18 bug");
});

Deno.test("PURE — 1. the dynamic proof was and remains valid", () => {
  const d = dynamic();
  assertEquals(d.ok, true);
  assertEquals(d.regime, "dynamic_camera_path");
  assertEquals(d.checked, 3);
});

Deno.test("PURE — 1. the generation-18 target has NO valid clip box, and the", () => {
  // finalizer says so instead of inventing one.
  //
  // This is the finding that V521 cannot engineer away: the union target
  // starts at plate y=324 while the rendered crop starts at y=327, and it is
  // 184 px wide against a 154 px crop. Transformed, that is
  // [234,-14,1094,580] against a 720 frame. So does Sarah's own plate box
  // ([201,-5,519,463]) and the padded dispatch box ([178,-33,542,482]) — all
  // three of the available authorities poke above the crop.
  //
  // Before V521 this pass reported ok:true with no box at all. Now it fails
  // closed, on the true reason, before any provider call.
  const r = finalizePreclipContainment({
    crop: CROP,
    targetBbox: TARGET,
    otherSpeakerCenters: [],
  });
  assertEquals(r.ok, false);
  assertEquals(r.reason, "transform_out_of_bounds");
  assertEquals(r.clipBox, undefined);
});

Deno.test("PURE — 1. a dynamic success DOES materialize a complete result", () => {
  // The same finalizer, on a target that fits its crop: this is what a
  // dynamic pass now produces instead of `ok: true, clipBox: undefined`.
  const crop = { x: 68, y: 327, size: 200, outputSize: 720 };
  const target: Box = [118, 340, 262, 480];
  const r = finalizePreclipContainment({ crop, targetBbox: target, otherSpeakerCenters: [] });
  assertEquals(r.ok, true);
  assert(Array.isArray(r.clipBox), "ok must imply a clip box");
  const [bx1, by1, bx2, by2] = r.clipBox!;
  // The SAME transform the static success path uses: (plate - crop) * scale.
  const scale = crop.outputSize / crop.size;
  assertEquals(bx1, Math.round((target[0] - crop.x) * scale));
  assertEquals(by1, Math.round((target[1] - crop.y) * scale));
  assert(bx2 > bx1 && by2 > by1, "non-degenerate");
  assert(bx1 >= 0 && by1 >= 0 && bx2 <= crop.outputSize && by2 <= crop.outputSize, "in bounds");
});

// ═══ Parts 11/12 — E.3 and E.4 run in the dynamic regime ═════════════════
Deno.test("PURE — 2/3. a dynamic success still executes E.3", () => {
  // A sibling centre inside the transformed target must fail, dynamic or not.
  // An in-crop target, so E.3 is the rule that decides rather than E.4.
  const crop = { x: 68, y: 327, size: 200, outputSize: 720 };
  const target: Box = [118, 340, 262, 480];
  const sibling: [number, number] = [200, 400];
  const r = finalizePreclipContainment({
    crop,
    targetBbox: target,
    otherSpeakerCenters: [sibling],
  });
  assertEquals(r.ok, false);
  assertEquals(r.reason, "other_speaker_center_in_target");
  assertEquals(r.clipBox, undefined, "a failure never carries a box");
});

Deno.test("PURE — 4/5. a dynamic success still executes E.4", () => {
  // Transform out of bounds: the target lies outside the crop's output frame.
  const far = finalizePreclipContainment({
    crop: { x: 0, y: 0, size: 100, outputSize: 720 },
    targetBbox: [500, 500, 600, 600],
    otherSpeakerCenters: [],
  });
  assertEquals(far.ok, false);
  assertEquals(far.reason, "transform_out_of_bounds");
  // Degenerate after rounding.
  const deg = finalizePreclipContainment({
    crop: { x: 0, y: 0, size: 100000, outputSize: 10 },
    targetBbox: [0, 0, 1, 1],
    otherSpeakerCenters: [],
  });
  assertEquals(deg.ok, false);
  assertEquals(deg.reason, "transform_degenerate");
  // An unusable crop is refused before any arithmetic.
  assertEquals(
    finalizePreclipContainment({
      crop: { x: 0, y: 0, size: 0, outputSize: 720 },
      targetBbox: TARGET,
      otherSpeakerCenters: [],
    }).reason,
    "invalid_crop",
  );
  assertEquals(
    finalizePreclipContainment({
      crop: CROP,
      targetBbox: [10, 10, 10, 20] as Box,
      otherSpeakerCenters: [],
    }).reason,
    "invalid_target_bbox",
  );
});

// ═══ Part 23 — one E.3, one transform ════════════════════════════════════
Deno.test("PURE — the static success path and the finalizer agree exactly", () => {
  // A target that IS inside its crop: the static path must return precisely
  // what the finalizer returns, because it is the same code.
  const crop = { x: 100, y: 100, size: 200, outputSize: 720 };
  const target: Box = [120, 120, 250, 250];
  const others: Array<[number, number]> = [[500, 500]];
  const viaStatic = evaluatePreclipCropContainment({
    crop,
    targetBbox: target,
    otherSpeakerCenters: others,
  });
  const viaFinalizer = finalizePreclipContainment({
    crop,
    targetBbox: target,
    otherSpeakerCenters: others,
  });
  assertEquals(viaStatic.ok, true);
  assertEquals(viaStatic.clipBox, viaFinalizer.clipBox);
  assertEquals(viaStatic.otherCentersClip, viaFinalizer.otherCentersClip);
});

// ═══ Part 15 — the static regime is untouched ════════════════════════════
Deno.test("PURE — 9/10. static containment keeps zero tolerance", () => {
  assertEquals(
    evaluatePreclipCropContainment({
      crop: { x: 100, y: 100, size: 200, outputSize: 720 },
      targetBbox: [99, 120, 250, 250],
      otherSpeakerCenters: [],
    }).reason,
    "target_not_contained_in_crop",
  );
  assertEquals(
    evaluatePreclipCropContainment({
      crop: { x: 100, y: 100, size: 200, outputSize: 720 },
      targetBbox: [120, 120, 250, 250],
      otherSpeakerCenters: [[180, 180]],
    }).reason,
    "other_speaker_center_in_target",
  );
});

Deno.test("PURE — the invariant: ok always implies a clip box", () => {
  // Every reachable outcome of the ONE producer, checked structurally.
  const cases = [
    { crop: CROP, targetBbox: TARGET, otherSpeakerCenters: [] },
    { crop: CROP, targetBbox: TARGET, otherSpeakerCenters: [[200, 380]] as Array<[number, number]> },
    { crop: { x: 0, y: 0, size: 100, outputSize: 720 }, targetBbox: [500, 500, 600, 600] as Box, otherSpeakerCenters: [] },
    { crop: { x: 0, y: 0, size: 0, outputSize: 720 }, targetBbox: TARGET, otherSpeakerCenters: [] },
  ];
  for (const c of cases) {
    const r = finalizePreclipContainment(c as never);
    assertEquals(r.ok, Array.isArray(r.clipBox), `ok and clipBox disagree for ${JSON.stringify(c.targetBbox)}`);
  }
});

// ═══ CONTRACT — wiring ═══════════════════════════════════════════════════
const read = (rel: string) => Deno.readTextFileSync(new URL(rel, import.meta.url));
const codeOnly = (src: string) =>
  src.split(/\r?\n/).map((l) => {
    const t = l.trim();
    return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") ? "" : l;
  }).join("\n");

const DIALOG = codeOnly(read("../compose-dialog-segments/index.ts"));
const CONTAINMENT = codeOnly(read("./preclip-crop-containment.ts"));

Deno.test("CONTRACT — 2. no failed static result is ever spread into a success", () => {
  assertEquals(DIALOG.includes("{ ...v519Static, ok: true, reason: undefined }"), false);
  assertEquals(DIALOG.includes("...v519Static"), false, "no spread of the static result at all");
  // The dynamic branch builds its own complete result.
  assert(DIALOG.includes("? finalizePreclipContainment({"));
});

Deno.test("CONTRACT — 23. exactly one E.3 implementation exists", () => {
  // The identity rule lives in the finalizer and nowhere else.
  // Count the RULE, not the type union member that names it.
  assertEquals(CONTAINMENT.split('reason: "other_speaker_center_in_target"').length - 1, 1);
  assertEquals(DIALOG.includes("other_speaker_center_in_target"), false);
  assertEquals(CONTAINMENT.split("const otherCentersClip").length - 1, 1);
  // …and exactly one place computes the clip box.
  assertEquals(CONTAINMENT.split("return { ok: true, clipBox:").length - 1, 1);
});

Deno.test("CONTRACT — 6/8. the assignment is compiler-proved, not asserted", () => {
  // The `!` that hid the defect is gone; a typed read narrows instead.
  assertEquals(DIALOG.includes("dispatchBox = containment.clipBox!"), false);
  assert(DIALOG.includes("const v521ClipBox = (containment as { clipBox?:"));
  assert(DIALOG.includes("} else if (!Array.isArray(v521ClipBox)) {"));
  assert(DIALOG.includes("dispatchBox = v521ClipBox;"));
  // The safety net names its own cause.
  assert(DIALOG.includes('reason: "containment_ok_without_clip_box"'));
  const guardAt = DIALOG.indexOf("!Array.isArray(v521ClipBox)");
  const assignAt = DIALOG.indexOf("dispatchBox = v521ClipBox;");
  assert(guardAt > 0 && guardAt < assignAt, "the guard must precede the assignment");
});

Deno.test("CONTRACT — 7/9. a missing dispatch box is no longer blamed on frames", () => {
  const at = DIALOG.indexOf("const v152FailReason =");
  assert(at > 0);
  const block = DIALOG.slice(at, at + 300);
  // The box is asked about FIRST; zero voiced frames keeps its real meaning.
  assert(block.includes('!dispatchBox') && block.indexOf("!dispatchBox") < block.indexOf("bbox_zero_voiced_frames"));
  assert(block.includes('"dispatch_box_missing"'));
  assert(block.includes('"bbox_zero_voiced_frames"'), "the true condition is preserved");
});

Deno.test("CONTRACT — 6. static E.1 stays visible as evidence, not as authority", () => {
  assert(DIALOG.includes("static_reason: v519Static.reason ?? null,"));
  assert(DIALOG.includes("clip_box_present: Array.isArray(v521ClipBox),"));
  assert(DIALOG.includes("post_containment_validation:"));
  // A static failure for any OTHER reason still decides.
  assert(DIALOG.includes("v519StaticNonContainment"));
});

Deno.test("CONTRACT — 16/17/18. V519, V520, V516 and V518 are untouched", () => {
  for (
    const rel of [
      "./v520-track-feasibility.ts",
      "./compute-mouth-centered-crop.ts",
      "./pass-face-preclip.ts",
      "./v516-mouth-coherence.ts",
      "./durable-scene-output.ts",
      "./lkg-output.ts",
    ]
  ) {
    assertEquals(read(rel).includes("v521"), false, `${rel} must not reference v521`);
    assertEquals(read(rel).includes("V521"), false);
  }
  // V519's own contract still stands in the containment module.
  assert(CONTAINMENT.includes("evaluateDynamicPreclipContainment"));
  assert(CONTAINMENT.includes("held.checked === 0"));
  assert(read("./v461-face-gate.ts").includes("export const V461_FACE_SHARE_FLOOR = 0.24;"));
});
