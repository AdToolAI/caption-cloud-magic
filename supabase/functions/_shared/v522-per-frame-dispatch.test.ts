/**
 * V522 — PER-FRAME DYNAMIC DISPATCH AUTHORITY
 *
 * Scene 67b392b1, generation 18, pass 0 (Sarah). The dynamic camera path
 * proved same-time containment over 6/6 samples, the pre-clip rendered at
 * 68,327,154 over 82 frames, the face track was 6/6 valid — and V521 still
 * failed the pass with `transform_out_of_bounds`.
 *
 * V521 was right about what it asked: the turn union [118,324,302,451] is
 * 184 px wide against a 154 px crop, so no single clip box exists. It was the
 * wrong question. In this mode the provider is not sent one box at all —
 * `bounding_boxes_url` carries a per-frame array, and V464 has built it from
 * Track(t) through Window(t) since long before V519. The union's job is
 * planning: feasibility, camera path, movement envelope. It has no dispatch
 * role, and asking it to transform through one static crop is the same
 * referent split this pipeline has produced at every scale.
 *
 * So the regime decides which geometry a success owes:
 *
 *   STATIC   one valid clip box.
 *   DYNAMIC  a validated per-frame sequence — E.4 by V464's bounds check,
 *            E.3 by the same membership rule, asked of every frame.
 *
 * Nothing is loosened. Eligibility still requires a frozen path AND usable
 * samples AND every sample held by its own window. Identity is still the
 * assignment-locked map. The crop is not grown, no threshold moves, and the
 * provider contract is untouched.
 *
 *   PURE     — executes the geometry.
 *   CONTRACT — asserts wiring no unit test can reach.
 */

import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  evaluateDynamicPreclipContainment,
  evaluatePreclipCropContainment,
  finalizePreclipContainment,
  findSiblingCenterInBox,
  isDynamicContainmentRegime,
  siblingCenterInBox,
} from "./preclip-crop-containment.ts";
import { cameraPathContainsAll } from "./pass-face-preclip.ts";
import {
  buildPerFrameAsdBoxes,
  evaluatePerFrameSiblingExclusion,
  validateAsdRegistration,
} from "./v464-asd-projection.ts";
import { buildAsdStrategy } from "./asd-strategy.ts";

type Box = [number, number, number, number];

// ── The generation-18 Sarah geometry, exactly as production held it ──────
/** Planner / Contract-E target: the turn union, PLATE pixels. */
const UNION: Box = [118, 324, 302, 451];
/** The pre-clip that actually rendered. */
const CROP = { x: 68, y: 327, size: 154, outputSize: 720 };
const FRAME_COUNT = 82;
const FPS = 30;
const START_SEC = 0;
const KEYFRAMES = [
  { t: 0.0, x: 68, y: 320, size: 200 },
  { t: 1.0, x: 80, y: 330, size: 200 },
  { t: 2.0, x: 95, y: 340, size: 200 },
];
// The camera lags the face slightly, as a real tracking path does. A path
// that matched the face EXACTLY would hold it still inside the window, and
// V464 refuses a constant box on a moving track (`constantBoxOnMovingTrack`)
// — a genuine rule, and a reminder that per-frame boxes only earn their name
// when the registration actually varies.
const TRACK = [
  { t: 0.0, box: [118, 324, 250, 451] as Box, mouth: null },
  { t: 1.0, box: [134, 336, 266, 463] as Box, mouth: null },
  { t: 2.0, box: [152, 348, 284, 475] as Box, mouth: null },
];
const VOICED: Array<[number, number]> = [[0, FRAME_COUNT / FPS]];

const dynamicProof = () =>
  evaluateDynamicPreclipContainment({
    cameraPathDynamic: true,
    keyframes: KEYFRAMES,
    trackSamples: TRACK,
    startSec: START_SEC,
    containsAll: cameraPathContainsAll,
  } as never);

const build = (over: Record<string, unknown> = {}) =>
  buildPerFrameAsdBoxes({
    frameCount: FRAME_COUNT,
    fps: FPS,
    staticCrop: CROP,
    cameraPath: { keyframes: KEYFRAMES },
    faceTrack: TRACK,
    preclipStartSec: START_SEC,
    anchorPlateBox: UNION,
    // V522 — the dynamic regime has no static dispatch box to offer.
    voicedWindowsSec: VOICED,
    ...over,
  } as never);

// ═══ 1. the generation-18 fixture ════════════════════════════════════════
Deno.test("PURE — 1. the union still has no valid clip box, and still says so", () => {
  const stat = evaluatePreclipCropContainment({
    crop: CROP,
    targetBbox: UNION,
    otherSpeakerCenters: [],
  });
  assertEquals(stat.ok, false);
  assertEquals(stat.reason, "target_not_contained_in_crop");
  const fin = finalizePreclipContainment({
    crop: CROP,
    targetBbox: UNION,
    otherSpeakerCenters: [],
  });
  assertEquals(fin.ok, false);
  assertEquals(fin.reason, "transform_out_of_bounds");
  assertEquals(fin.clipBox, undefined);
});

Deno.test("PURE — 1. the dynamic proof passes, and V464 builds a valid sequence", () => {
  const d = dynamicProof();
  assertEquals(d.ok, true);
  assertEquals(d.regime, "dynamic_camera_path");
  assert(d.checked > 0);

  const built = build();
  assertEquals(built.registration, "per_frame");
  assertEquals(built.cropSource, "camera_path");
  assertEquals(built.trackSource, "face_track");
  assertEquals(built.varying, true);
  assertEquals(built.anchorDispatchProvided, false);
  assertEquals(built.boxes.length, FRAME_COUNT);

  // E.4, per frame: every projected box finite, in bounds, non-degenerate.
  const v = validateAsdRegistration({
    built,
    frameCount: FRAME_COUNT,
    outputSize: CROP.outputSize,
  });
  assertEquals(v.ok, true, `V464 verdict: ${v.reason}`);
  assertEquals(v.boundsValid, true);
  assertEquals(v.constantBoxOnMovingTrack, false);

  // …and the sequence is non-empty, which is what generation 18 lacked.
  const nonNull = built.boxes.filter((b) => b !== null).length;
  assert(nonNull > 0, "the pass that reported bbox_zero_voiced_frames has boxes");
  assertEquals(nonNull, FRAME_COUNT);
});

// ═══ 2. dynamic mode does not require a static dispatch box ══════════════
Deno.test("PURE — 2. the builder works with no anchorDispatchBox at all", () => {
  const built = build();
  assertEquals(built.rawAnchorMargins, [0, 0, 0, 0]);
  assertEquals(built.appliedMargins, [0, 0, 0, 0]);
  assertEquals(built.negativeMarginsClamped, false);
  // Zero margins mean the emitted box IS the projected tracked face — no
  // anchor-derived distortion, which is exactly what V510-P1 already produced
  // whenever a track existed.
  assert(built.frameBoxes.every((b) => b[2] > b[0] && b[3] > b[1]));
});

// ═══ 3. eligibility rests on proven evidence, never on motion ════════════
Deno.test("PURE — 3. dynamic eligibility is refused without frozen evidence", () => {
  assertEquals(
    isDynamicContainmentRegime({
      cameraPathDynamic: true,
      keyframes: null,
      trackSamples: TRACK,
    }),
    false,
    "no path — not a dynamic regime",
  );
  assertEquals(
    isDynamicContainmentRegime({
      cameraPathDynamic: true,
      keyframes: KEYFRAMES,
      trackSamples: [],
    }),
    false,
    "no samples — not a dynamic regime",
  );
  assertEquals(
    isDynamicContainmentRegime({
      cameraPathDynamic: false,
      keyframes: KEYFRAMES,
      trackSamples: TRACK,
    }),
    false,
    "moving pixels without a frozen path are a static pass",
  );
  assertEquals(
    isDynamicContainmentRegime({
      cameraPathDynamic: true,
      keyframes: KEYFRAMES,
      trackSamples: TRACK,
    }),
    true,
  );
});

// ═══ 6/7. Contract E.3, per frame ════════════════════════════════════════
Deno.test("PURE — 6. sibling centres are projected through EACH frame's crop", () => {
  // A sibling standing still in the plate moves in clip space, because the
  // window moves. One projection for the whole pass would be a box nobody
  // rendered — the same error one level down.
  const sibling: [number, number] = [400, 400];
  const built = build({ otherSpeakerPlateCenters: [sibling] });
  assertEquals(built.frameOtherCenters.length, FRAME_COUNT);
  assertEquals(built.frameOtherCenters[0].length, 1);
  const first = built.frameOtherCenters[0][0];
  const last = built.frameOtherCenters[FRAME_COUNT - 1][0];
  assert(
    first[0] !== last[0] || first[1] !== last[1],
    "a static sibling must move in clip space when the camera does",
  );
  // Sarah's own sequence is clean of it.
  assertEquals(evaluatePerFrameSiblingExclusion(built).ok, true);
});

Deno.test("PURE — 7. one violating frame fails the whole pass", () => {
  const clean = build({ otherSpeakerPlateCenters: [] });
  assertEquals(evaluatePerFrameSiblingExclusion(clean).ok, true);
  assertEquals(evaluatePerFrameSiblingExclusion(clean).centersPerFrame, 0);

  // Put the sibling at the centre of Sarah's own tracked face at t=0. It is
  // inside the frame-0 box and not the concern of any later frame — and that
  // single frame is enough.
  const t0 = TRACK[0].box;
  const inside: [number, number] = [(t0[0] + t0[2]) / 2, (t0[1] + t0[3]) / 2];
  const built = build({ otherSpeakerPlateCenters: [inside] });
  const verdict = evaluatePerFrameSiblingExclusion(built);
  assertEquals(verdict.ok, false);
  assertEquals(verdict.failedFrame, 0);
  assert(Array.isArray(verdict.failedBox));
  assert(Array.isArray(verdict.failedCenter));
});

Deno.test("PURE — 7. the membership rule is boundary-inclusive, with no tolerance", () => {
  const b: Box = [10, 10, 20, 20];
  assertEquals(siblingCenterInBox([10, 10], b), true, "the corner counts");
  assertEquals(siblingCenterInBox([20, 20], b), true);
  assertEquals(siblingCenterInBox([9, 15], b), false, "one pixel out is out");
  assertEquals(siblingCenterInBox([15, 21], b), false);
  assertEquals(findSiblingCenterInBox(b, [[0, 0], [15, 15]]), [15, 15]);
  assertEquals(findSiblingCenterInBox(b, [[0, 0]]), null);
});

Deno.test("PURE — 6. a far sibling is not dragged onto the frame edge", () => {
  // `projectPlatePointToPreclip` clamps, which is right for the mouth and
  // wrong here: a clamped centre lands on the border, where any box touching
  // that border would "contain" a speaker who is nowhere near the crop.
  const built = build({ otherSpeakerPlateCenters: [[5000, 5000]] });
  const c = built.frameOtherCenters[0][0];
  assert(
    c[0] > CROP.outputSize && c[1] > CROP.outputSize,
    `a far sibling must stay outside the frame, got ${JSON.stringify(c)}`,
  );
  assertEquals(evaluatePerFrameSiblingExclusion(built).ok, true);
});

// ═══ 8/9. Contract E.4, per frame ════════════════════════════════════════
Deno.test("PURE — 8/9. an out-of-frame projected box fails the sequence closed", () => {
  // A track sample far outside the window projects outside the frame. V464's
  // own bounds check is E.4 for the dynamic regime, and it refuses.
  const bad = [
    TRACK[0],
    { t: 1.0, box: [900, 900, 1100, 1100] as Box, mouth: null },
    TRACK[2],
  ];
  const built = build({ faceTrack: bad });
  const v = validateAsdRegistration({
    built,
    frameCount: FRAME_COUNT,
    outputSize: CROP.outputSize,
  });
  assertEquals(v.ok, false);
  assert(
    v.reason === "box_out_of_bounds" || v.reason === "mouth_outside_box",
    `expected a bounds/registration refusal, got ${v.reason}`,
  );
});

Deno.test("PURE — 9. a degenerate frame is never replaced by another face", () => {
  // With no anchor dispatch box there is nothing safe to substitute, so the
  // degenerate box is emitted as-is and validation refuses the sequence.
  // Before V522 this slot held the static union — a box nobody rendered.
  const degenerate = [
    { t: 0.0, box: [200, 200, 200.5, 200.5] as Box, mouth: null },
    { t: 2.0, box: [200, 200, 200.5, 200.5] as Box, mouth: null },
  ];
  const built = build({ faceTrack: degenerate, cameraPath: null });
  assertEquals(built.anchorDispatchProvided, false);
  const v = validateAsdRegistration({
    built,
    frameCount: FRAME_COUNT,
    outputSize: CROP.outputSize,
  });
  assertEquals(v.ok, false);
  assertEquals(v.boundsValid, false);
});

// ═══ 13. the static regime is byte-for-byte unchanged ════════════════════
Deno.test("PURE — 13. a static pass keeps its anchor margins and its fallback", () => {
  const dispatch: Box = [100, 60, 620, 660];
  const built = build({ anchorDispatchBox: dispatch, cameraPath: null, faceTrack: null });
  assertEquals(built.anchorDispatchProvided, true);
  assertEquals(built.registration, "anchor_constant");
  assertEquals(built.cropSource, "static");
  assertEquals(built.trackSource, "anchor");
  // Legacy policy: raw margins from the anchor pair, applied unclamped.
  assertEquals(built.marginPolicy, "legacy_anchor");
  assert(built.rawAnchorMargins.some((m) => m !== 0), "the anchor pair still frames");
  assertEquals(built.appliedMargins, built.rawAnchorMargins);
  // With no track and no path the whole sequence is one constant box.
  assertEquals(built.varying, false);
});

Deno.test("PURE — 13. the anchor fallback still fires when an anchor exists", () => {
  const dispatch: Box = [100, 60, 620, 660];
  const degenerate = [
    { t: 0.0, box: [200, 200, 200.5, 200.5] as Box, mouth: null },
    { t: 2.0, box: [200, 200, 200.5, 200.5] as Box, mouth: null },
  ];
  const built = build({ anchorDispatchBox: dispatch, faceTrack: degenerate, cameraPath: null });
  assertEquals(built.anchorDispatchProvided, true);
  // Unchanged pre-V522 behaviour: the constant anchor box substitutes.
  assert(
    built.frameBoxes.some((b) => b.join(",") === dispatch.join(",")),
    "the static fallback is untouched",
  );
});

// ═══ 14. the voiced mask, and what bbox_zero_voiced_frames now means ═════
Deno.test("PURE — 14. the voiced mask still masks, and E.3 skips silence", () => {
  // Frames outside the spoken turn stay null (v201 strict turn-scoping), and
  // E.3 only examines what is actually dispatched.
  const built = build({ voicedWindowsSec: [[0, 1]] });
  const nonNull = built.boxes.filter((b) => b !== null).length;
  assert(nonNull > 0 && nonNull < FRAME_COUNT, `masked ${nonNull}/${FRAME_COUNT}`);
  assertEquals(built.frameBoxes.length, FRAME_COUNT, "the geometry exists for every frame");
  const v = evaluatePerFrameSiblingExclusion(
    build({ voicedWindowsSec: [[0, 1]], otherSpeakerPlateCenters: [[400, 400]] }),
  );
  assertEquals(v.checkedFrames, nonNull, "silent frames claim no identity");
});

Deno.test("PURE — 14. an all-null sequence is not reachable through masking", () => {
  // Worth stating plainly, because generation 18 was blamed on it: a window
  // outside the clip is DROPPED by the mask filter (`fe >= fs`), and an empty
  // window list full-fills rather than emitting nulls. So once a sequence
  // exists, masking alone cannot produce zero dispatched frames.
  //
  // `bbox_zero_voiced_frames` therefore describes a builder that returned
  // nothing usable — not a speaker who was silent. V521 and V522 give the
  // two real causes their own names; this branch stays as the backstop for
  // a mask that does start dropping everything.
  assertEquals(build({ voicedWindowsSec: [[100, 101]] }).boxes.filter((b) => b !== null).length, FRAME_COUNT);
  assertEquals(build({ voicedWindowsSec: [] }).boxes.filter((b) => b !== null).length, FRAME_COUNT);
});

// ═══ 15. the provider payload is the same exclusive union ════════════════
Deno.test("PURE — 15. a per-frame dispatch sends bounding_boxes_url and nothing else", () => {
  const r = buildAsdStrategy({
    preflight: null,
    geometry: { prebuiltBoundingBoxesUrl: "https://example.test/boxes.json" },
    retryVariant: "bbox-url-pro",
    isMultiSpeaker: true,
    usePreclip: true,
  } as never);
  assertEquals(r.asd.auto_detect, false);
  assert("bounding_boxes_url" in r.asd);
  assertEquals("coordinates" in r.asd, false);
  assertEquals("frame_number" in r.asd, false);
  assertEquals("bounding_boxes" in r.asd, false);
  assertEquals(r.frameNumber, null);
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
const V464 = codeOnly(read("./v464-asd-projection.ts"));

Deno.test("CONTRACT — 2/3. V464 eligibility no longer demands a static box", () => {
  assert(
    DIALOG.includes(
      "const v464Eligible = v161UsingPreclipForBbox && !!v161PreclipCrop && !!box &&",
    ),
  );
  assert(DIALOG.includes("(!!dispatchBox || v522PerFrameOnly);"));
  // …and the per-frame flag is set ONLY from a proven dynamic containment.
  assert(DIALOG.includes("const v522DynamicDecides = !!v519Dynamic?.ok && !v519StaticNonContainment;"));
  assert(DIALOG.includes("v522DynamicAuthority = v522DynamicDecides && containment.ok;"));
  assert(DIALOG.includes("v522PerFrameOnly = v522DynamicAuthority &&"));
});

Deno.test("CONTRACT — 2. the plate-space box never survives into a clip payload", () => {
  // `dispatchBox` is initialised to the PLATE box. The per-frame branch must
  // clear it explicitly, or a plate box would travel into a clip-space wire.
  const at = DIALOG.indexOf("} else if (v522PerFrameOnly) {");
  assert(at > 0);
  const branch = DIALOG.slice(at, at + 900);
  assert(branch.includes("dispatchBox = null;"));
});

Deno.test("CONTRACT — 4. URL transport is authorized by the sequence, not the box", () => {
  assert(
    DIALOG.includes(
      "(!!dispatchBox || (v522PerFrameOnly && !!v464Built));",
    ),
  );
});

Deno.test("CONTRACT — 5. the canonical boxes come from V464 whenever it built", () => {
  const at = DIALOG.indexOf("const v406CanonicalBoxes");
  assert(at > 0);
  const after = DIALOG.slice(at, at + 600);
  assert(after.includes("? v464Built.boxes as"));
  // The repeated-static-box path is the ELSE, never a downgrade from V464.
  assert(after.indexOf("buildPerFrameBoxes({") > after.indexOf("? v464Built.boxes as"));
  assert(DIALOG.includes("const nonNullFrames = v406CanonicalBoxes.reduce("));
});

Deno.test("CONTRACT — 6/7. per-frame E.3 is wired, enforced and fails closed", () => {
  assert(DIALOG.includes("const v522SiblingVerdict = v464Built"));
  assert(DIALOG.includes("? evaluatePerFrameSiblingExclusion(v464Built)"));
  assert(DIALOG.includes("v522DynamicAuthority && v522SiblingVerdict && !v522SiblingVerdict.ok &&"));
  assert(DIALOG.includes('reason: "dynamic_sibling_center_in_frame_box",'));
  // It tests the assignment-locked map the static gate tests, not a new one.
  assert(DIALOG.includes("v522OtherPlateCenters = otherCenters;"));
  assert(DIALOG.includes("otherSpeakerPlateCenters: v522OtherPlateCenters,"));
});

Deno.test("CONTRACT — 11. exactly one E.3 membership rule exists", () => {
  // The rule lives in the containment module. V464 imports it rather than
  // asking what "inside" means a second time.
  assertEquals(CONTAINMENT.split("export function siblingCenterInBox").length - 1, 1);
  assert(V464.includes('import { findSiblingCenterInBox } from "./preclip-crop-containment.ts";'));
  assertEquals(V464.includes("center[0] >= "), false, "no second membership test");
  assertEquals(CONTAINMENT.split('reason: "other_speaker_center_in_target"').length - 1, 1);
});

Deno.test("CONTRACT — 10/11/12. the missing-geometry diagnostic is regime-specific", () => {
  assert(DIALOG.includes("const v152FailReason = (!dispatchBox && !v522PerFrameOnly)"));
  assert(DIALOG.includes('? "dispatch_box_missing"'));
  assert(DIALOG.includes('? "dynamic_bbox_sequence_missing"'));
  // The consequence never precedes the cause again.
  const dispatchMissing = DIALOG.indexOf('? "dispatch_box_missing"');
  const zeroVoiced = DIALOG.indexOf('? "bbox_zero_voiced_frames"');
  assert(dispatchMissing > 0 && zeroVoiced > dispatchMissing);
});

Deno.test("CONTRACT — 16. V521's invariant survives, narrowed by regime", () => {
  // A STATIC success still owes a clip box, and the guard still exists.
  assert(DIALOG.includes("} else if (!Array.isArray(v521ClipBox)) {"));
  assert(DIALOG.includes('reason: "containment_ok_without_clip_box",'));
  // No failed result is spread into a success, still.
  assertEquals(DIALOG.includes("...v519Static"), false);
  // The dynamic branch that skips the clip box is reachable ONLY through a
  // union-transform failure, never through an identity or crop failure.
  assert(
    DIALOG.includes(
      "const v522UnionUnrenderable = !!v522Finalized && !v522Finalized.ok &&",
    ),
  );
  assert(DIALOG.includes('(v522Finalized.reason === "transform_out_of_bounds" ||'));
  assert(DIALOG.includes('v522Finalized.reason === "transform_degenerate");'));
  assertEquals(
    DIALOG.includes('v522Finalized.reason === "other_speaker_center_in_target"'),
    false,
    "an identity failure is never renderability",
  );
});

Deno.test("CONTRACT — frozen: no crop growth, no new threshold, no provider change", () => {
  const gate = read("./v461-face-gate.ts");
  assert(gate.includes("export const V461_FACE_SHARE_FLOOR = 0.24;"));
  assertEquals(gate.includes("V522"), false);
  const feas = read("./v520-track-feasibility.ts");
  assertEquals(feas.includes("V522"), false);
  const crop = read("./compute-mouth-centered-crop.ts");
  assertEquals(crop.includes("V522"), false);
  const preclip = read("./pass-face-preclip.ts");
  assertEquals(preclip.includes("V522"), false);
  // The V152 bounds are untouched.
  assert(DIALOG.includes("const v152UpperBound = v161UsingPreclipForBbox ? 0.98 : 0.45;"));
  assert(DIALOG.includes("boxAreaPct >= 0.002 && boxAreaPct <= v152UpperBound"));
  // The ASD wire union is untouched.
  const asd = read("./asd-strategy.ts");
  assertEquals(asd.includes("V522"), false);
});

Deno.test("CONTRACT — 14. the V152 area source only changes where no box exists", () => {
  assert(DIALOG.includes("const boxArea = dispatchBox"));
  assert(
    DIALOG.includes(
      "? Math.max(0, (dispatchBox[2] - dispatchBox[0]) * (dispatchBox[3] - dispatchBox[1]))",
    ),
  );
  assert(DIALOG.includes("v522DispatchedAreas.reduce((a, v) => a + v, 0) / v522DispatchedAreas.length"));
});
