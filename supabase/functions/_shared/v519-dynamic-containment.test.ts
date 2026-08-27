/**
 * V519 — DYNAMIC PRECLIP CONTAINMENT AUTHORITY
 *
 * Scene 67b392b1, generation 16, pass 4 (Matthew). Contract E refused the pass
 * before dispatch with `target_not_contained_in_crop`:
 *
 *   target (turn union)  [757,339,884,525]   127 x 186
 *   applied static crop  [709,317,837,445]   128 x 128
 *
 * The arithmetic was right. The question was not. The renderer followed a
 * moving camera path, and the planner had already proven that every measured
 * face box is held by the window rendered at its own instant — the union is a
 * box nobody rendered.
 *
 * Two defects, both fixed here:
 *   1. the planner reported `containsTarget` from a projection it discarded;
 *   2. Contract E applied a STATIC containment rule to a DYNAMIC plan.
 *
 *   PURE     — executes the decision logic.
 *   GEOMETRY — drives the real planner and the real evaluators.
 *   CONTRACT — asserts wiring no unit test can reach.
 */

import { assert, assertEquals } from "jsr:@std/assert@1";
import { computeMouthCenteredCrop } from "./compute-mouth-centered-crop.ts";
import {
  evaluateDynamicPreclipContainment,
  evaluatePreclipCropContainment,
  isDynamicContainmentRegime,
} from "./preclip-crop-containment.ts";
import { cameraPathContainsAll } from "./pass-face-preclip.ts";

// ── The generation-16 Matthew geometry, exactly as production held it ────
const TARGET: [number, number, number, number] = [757, 339, 884, 525]; // 127 x 186
const CROP = { x: 709, y: 317, size: 128, outputSize: 720 };
const PLATE = { width: 1080, height: 1920 };
const START_SEC = 10;

/** A path that actually tracks Matthew down the frame, as the renderer did. */
const KEYFRAMES = [
  { t: 0.0, x: 700, y: 320, size: 200 },
  { t: 1.0, x: 720, y: 380, size: 200 },
  { t: 2.0, x: 750, y: 440, size: 200 },
];
/** Plate-absolute sample times — the track clock starts at the plate. */
const TRACK = [
  { t: START_SEC + 0.0, box: [757, 339, 884, 460] },
  { t: START_SEC + 1.0, box: [770, 400, 890, 520] },
  { t: START_SEC + 2.0, box: [790, 450, 910, 570] },
];

const dyn = (over: Record<string, unknown> = {}) =>
  evaluateDynamicPreclipContainment({
    cameraPathDynamic: true,
    keyframes: KEYFRAMES,
    trackSamples: TRACK,
    startSec: START_SEC,
    containsAll: cameraPathContainsAll,
    ...over,
  } as never);

// ═══ Part 15 — the projection-discard defect ═════════════════════════════
Deno.test("PURE — 1. a discarded projection no longer reports containment", () => {
  // Dynamic mode: `perFrameMinCropPx` present, so a projection that would have
  // to GROW the crop is deliberately thrown away.
  const r = computeMouthCenteredCrop({
    // A single measured face of ~83 px yields exactly the production crop
    // size of 128, while the turn union below is 186 px tall.
    face: { bbox: [790, 380, 873, 463], center: [831, 421], mouth: [831, 445] },
    plateWidth: PLATE.width,
    plateHeight: PLATE.height,
    targetFaceShare: 0.42,
    minSize: 128,
    outputSize: 720,
    containBox: TARGET,
    // Dynamic: a moving crop never holds the whole turn at once.
    perFrameMinCropPx: 100,
  });
  assertEquals(r.crop.size, 128, "the production crop size");
  assertEquals(r.projectionRequiredGrowth, true, "the union is taller than the crop");
  assertEquals(r.projectionDiscarded, true);
  assertEquals(r.projectionApplied, false);
  // The verdict now describes the crop that is RETURNED.
  assertEquals(r.containsTarget, false);
  const fits = r.crop.x <= TARGET[0] && r.crop.y <= TARGET[1] &&
    r.crop.x + r.crop.size >= TARGET[2] && r.crop.y + r.crop.size >= TARGET[3];
  assertEquals(r.containsTarget, fits, "the flag must equal the geometry");
});

Deno.test("PURE — 16. an APPLIED projection still reports honest true", () => {
  // Static mode: the projection owns position and size, so it is applied and
  // the final crop really does contain the box.
  const r = computeMouthCenteredCrop({
    face: { bbox: [757, 339, 884, 465], center: [820, 402], mouth: [820, 430] },
    plateWidth: PLATE.width,
    plateHeight: PLATE.height,
    targetFaceShare: 0.42,
    minSize: 128,
    outputSize: 720,
    containBox: TARGET,
  });
  assertEquals(r.projectionApplied, true);
  assertEquals(r.projectionDiscarded, false);
  assertEquals(r.containsTarget, true);
  assert(r.crop.y <= TARGET[1] && r.crop.y + r.crop.size >= TARGET[3], "grew to hold it");
});

// ═══ Parts 11-13 — the dynamic regime ════════════════════════════════════
Deno.test("GEOMETRY — 9/2. the generation-16 union fails static, passes dynamic", () => {
  // BEFORE V519: this is the production failure, and it stays true.
  const stat = evaluatePreclipCropContainment({
    crop: CROP,
    targetBbox: TARGET,
    otherSpeakerCenters: [],
  });
  assertEquals(stat.ok, false);
  assertEquals(stat.reason, "target_not_contained_in_crop");

  // AFTER V519: the same pass, judged against the windows actually rendered.
  const d = dyn();
  assertEquals(d.ok, true, `dynamic failed: ${d.reason} ${d.detail ?? ""}`);
  assertEquals(d.regime, "dynamic_camera_path");
  assertEquals(d.checked, 3);
});

Deno.test("PURE — 3/12. one frame outside its own window fails closed", () => {
  const broken = TRACK.map((s, i) =>
    i === 1 ? { ...s, box: [770, 400, 890, 700] } : s
  );
  const d = dyn({ trackSamples: broken });
  assertEquals(d.ok, false);
  assertEquals(d.reason, "path_does_not_contain_track");
  assert((d.checked ?? 0) > 0);
  assert(Array.isArray(d.failedBox));
});

Deno.test("PURE — 4/13. motion alone is never authority", () => {
  // No path, no keyframes, no samples, wrong flag — every one of them FAILS.
  assertEquals(dyn({ cameraPathDynamic: false }).reason, "camera_path_not_dynamic");
  assertEquals(dyn({ keyframes: null }).reason, "camera_path_missing");
  assertEquals(dyn({ keyframes: [] }).reason, "camera_path_missing");
  assertEquals(dyn({ keyframes: [{ t: 0, x: 1, y: 1, size: 0 }] }).reason, "camera_path_missing");
  assertEquals(dyn({ trackSamples: null }).reason, "no_track_samples");
  assertEquals(dyn({ trackSamples: [] }).reason, "no_track_samples");
  assertEquals(dyn({ trackSamples: [{ t: 1, box: [5, 5, 1, 1] }] }).reason, "no_track_samples");
  for (const d of [dyn({ cameraPathDynamic: false }), dyn({ keyframes: null })]) {
    assertEquals(d.ok, false);
  }
});

Deno.test("PURE — the regime gate needs the flag AND a path AND samples", () => {
  const base = { cameraPathDynamic: true, keyframes: KEYFRAMES, trackSamples: TRACK };
  assertEquals(isDynamicContainmentRegime(base), true);
  assertEquals(isDynamicContainmentRegime({ ...base, cameraPathDynamic: false }), false);
  assertEquals(isDynamicContainmentRegime({ ...base, keyframes: [] }), false);
  assertEquals(isDynamicContainmentRegime({ ...base, trackSamples: [] }), false);
  assertEquals(isDynamicContainmentRegime({}), false);
});

Deno.test("PURE — 5. samples are paired with their OWN instant", () => {
  // The keyframe clock starts at the preclip, the track clock at the plate.
  // Getting `startSec` wrong samples the right path at the wrong moment, and
  // the geometry must notice.
  const shifted = dyn({ startSec: START_SEC - 2 });
  assertEquals(shifted.ok, false, "a two-second pairing error must not pass");
  // …and with the correct start it holds.
  assertEquals(dyn().ok, true);
});

// ═══ Part 14/17 — the static regime is untouched ═════════════════════════
Deno.test("PURE — 6/14. static containment keeps zero tolerance", () => {
  // One pixel of overhang still fails, exactly as before.
  const r = evaluatePreclipCropContainment({
    crop: { x: 100, y: 100, size: 200, outputSize: 720 },
    targetBbox: [99, 120, 250, 250],
    otherSpeakerCenters: [],
  });
  assertEquals(r.ok, false);
  assertEquals(r.reason, "target_not_contained_in_crop");
});

Deno.test("PURE — 5/11/17. a contained static target still passes", () => {
  const r = evaluatePreclipCropContainment({
    crop: { x: 100, y: 100, size: 200, outputSize: 720 },
    targetBbox: [120, 120, 250, 250],
    otherSpeakerCenters: [[500, 500]],
  });
  assertEquals(r.ok, true);
  assert(Array.isArray(r.clipBox));
});

Deno.test("PURE — 7. sibling ambiguity still fails, in either regime", () => {
  // E.3 is identity, not geometry: it is untouched by V519 and still rejects a
  // crop whose target region swallows another assigned speaker's centre.
  const r = evaluatePreclipCropContainment({
    crop: { x: 100, y: 100, size: 200, outputSize: 720 },
    targetBbox: [120, 120, 250, 250],
    otherSpeakerCenters: [[180, 180]],
  });
  assertEquals(r.ok, false);
  assertEquals(r.reason, "other_speaker_center_in_target");
});

Deno.test("PURE — 8. a degenerate or out-of-bounds transform still fails", () => {
  assertEquals(
    evaluatePreclipCropContainment({
      crop: { x: 0, y: 0, size: 0, outputSize: 720 },
      targetBbox: [1, 1, 2, 2],
      otherSpeakerCenters: [],
    }).reason,
    "invalid_crop",
  );
  assertEquals(
    evaluatePreclipCropContainment({
      crop: { x: 0, y: 0, size: 100, outputSize: 720 },
      targetBbox: [10, 10, 10, 20],
      otherSpeakerCenters: [],
    }).reason,
    "invalid_target_bbox",
  );
});

// ═══ CONTRACT — wiring ═══════════════════════════════════════════════════
const read = (rel: string) => Deno.readTextFileSync(new URL(rel, import.meta.url));
const codeOnly = (src: string) =>
  src.split(/\r?\n/).map((l) => {
    const t = l.trim();
    return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") ? "" : l;
  }).join("\n");

const DIALOG = codeOnly(read("../compose-dialog-segments/index.ts"));
const PLANNER = codeOnly(read("./compute-mouth-centered-crop.ts"));

Deno.test("CONTRACT — the planner verdict is computed on the FINAL crop", () => {
  // The old copy from the projection is gone.
  assertEquals(PLANNER.includes("containsTarget = p.containsTarget;"), false);
  assert(PLANNER.includes("containsTarget = x <= containBox[0] && y <= containBox[1] &&"));
  assert(PLANNER.includes("projectionDiscarded = true;"));
});

Deno.test("CONTRACT — Contract E is regime-aware and reuses the planner proof", () => {
  assert(DIALOG.includes("isDynamicContainmentRegime({"));
  assert(DIALOG.includes("evaluateDynamicPreclipContainment({"));
  assert(DIALOG.includes("containsAll: cameraPathContainsAll,"));
  // The static evaluator still runs on every pass.
  assert(DIALOG.includes("const v519Static = evaluatePreclipCropContainment({"));
  // …and a dynamic pass still owes every non-containment static check.
  assert(DIALOG.includes("v519StaticNonContainment"));
});

Deno.test("CONTRACT — 12. a V519 failure still reaches the pre-dispatch hard fail", () => {
  // V521 restructured the ternary (it no longer starts with `v519Dynamic`),
  // and V522 gave the binding an explicit type, so anchor on the binding NAME
  // rather than on either spelling. The invariant is unchanged: whatever the
  // regime decides, a containment failure still reaches the pre-dispatch
  // hard fail and no provider call happens.
  const at = DIALOG.indexOf("const containment");
  assert(at > 0);
  const after = DIALOG.slice(at, at + 3000);
  assert(after.includes("if (!containment.ok) {"));
  assert(after.includes('reason: "preclip_identity_geometry_mismatch"'));
});

Deno.test("CONTRACT — frozen: V516, thresholds and provider dispatch are untouched", () => {
  const v516 = read("./v516-mouth-coherence.ts");
  assertEquals(v516.includes("v519"), false);
  assertEquals(v516.includes("V519"), false);
  const gate = read("./v461-face-gate.ts");
  assert(gate.includes("export const V461_FACE_SHARE_FLOOR = 0.24;"));
  assert(gate.includes("export const V461_FACE_SIZE_PROVIDER_PX_FLOOR = 144;"));
  assertEquals(gate.includes("V519"), false);
  // Identity authority keeps its own module and its own rules.
  const auth = read("./preclip-geometry-authority.ts");
  assert(auth.includes("export function resolvePreclipContainmentAuthority"));
});
