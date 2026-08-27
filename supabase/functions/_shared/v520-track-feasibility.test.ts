/**
 * V520 — SINGLE-AUTHORITY CROP FEASIBILITY + EARLY TERMINAL FENCE
 *
 * Scene 67b392b1, generation 17, pass 1 (Sarah Dusatko). The planner refused
 * to render before any provider dispatch:
 *
 *   min_crop_269px_exceeds_face_share_cap_212px
 *
 * The refusal was fail-closed and correct; the interval was not. Its lower
 * bound came from a ~247 px V477 track sample and its upper from her 87 x 124
 * assignment snapshot. The same speaker's other turn in the same generation
 * planned a 191 px crop and was dispatched successfully — her face is not
 * un-croppable. The two scales were being compared as one authority.
 *
 *   PURE     — executes the decision logic.
 *   GEOMETRY — drives the real planner.
 *   CONTRACT — asserts wiring no unit test can reach.
 */

import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  buildTrackFeasibilityTelemetry,
  evaluateTrackFeasibility,
  requiredCropForSample,
  sanitizeTurnTrackSamples,
  shareCapForSample,
} from "./v520-track-feasibility.ts";
import { computeMouthCenteredCrop } from "./compute-mouth-centered-crop.ts";
import { V461_FACE_SHARE_FLOOR } from "./v461-face-gate.ts";
import { CONTAINMENT_PAD_RATIO } from "./dynamic-camera-path.ts";

type Box = [number, number, number, number];

const FLOOR = V461_FACE_SHARE_FLOOR;
const PAD = CONTAINMENT_PAD_RATIO;
/** Sarah's assignment-locked snapshot: 87 x 124. */
const ANCHOR: Box = [300, 400, 387, 524];
/** The ~247 px track sample that produced the 269 px floor. */
const INFLATED: Box = [290, 380, 537, 627];

const sanitize = (samples: unknown[], anchorBox: Box | null = ANCHOR) =>
  sanitizeTurnTrackSamples({ samples, anchorBox, faceShareFloor: FLOOR, padRatio: PAD });
const feasibility = (samples: unknown[], anchorBox: Box | null = ANCHOR) =>
  evaluateTrackFeasibility({
    accepted: sanitize(samples, anchorBox).accepted,
    faceShareFloor: FLOOR,
    padRatio: PAD,
  });

// ═══ 1 — the production numbers ══════════════════════════════════════════
Deno.test("PURE — 1. the generation-17 mixed-authority interval is reproduced", () => {
  // Upper bound as it was: measured on the SNAPSHOT.
  assertEquals(Math.floor(shareCapForSample(ANCHOR, FLOOR)), 212);
  // Lower bound as it was: measured on the TRACK.
  assertEquals(Math.ceil(requiredCropForSample(INFLATED, PAD)), 269);
  assert(269 > 212, "this is the refusal production reported");
  // Same-authority: the inflated sample's OWN cap is 504, not 212.
  assertEquals(Math.floor(shareCapForSample(INFLATED, FLOOR)), 504);
});

Deno.test("PURE — 6. both ends of the interval come from one authority", () => {
  const f = feasibility([{ t: 0, box: ANCHOR }]);
  assertEquals(f.authority, "turn_track");
  // Min and max are both computed on the accepted samples.
  assertEquals(f.minCropRequiredPx, Math.ceil(requiredCropForSample(ANCHOR, PAD)));
  assertEquals(f.maxCropByFaceSharePx, Math.floor(shareCapForSample(ANCHOR, FLOOR)));
  assertEquals(f.feasible, true);
});

// ═══ 2/7 — the Sarah fixture ═════════════════════════════════════════════
Deno.test("PURE — 2/7. the inflated sample cannot raise the floor for the locked face", () => {
  const s = sanitize([{ t: 0, box: ANCHOR }, { t: 1, box: INFLATED }]);
  assertEquals(s.accepted.length, 1);
  assertEquals(s.rejectedCounts.scale_incoherent_with_anchor, 1);

  const f = feasibility([{ t: 0, box: ANCHOR }, { t: 1, box: INFLATED }]);
  assertEquals(f.feasible, true, "Sarah's turn is renderable once the authority is single");
  assertEquals(f.minCropRequiredPx, 135);
  assertEquals(f.maxCropByFaceSharePx, 212);
  // Her other turn in the same generation planned 191 — inside this band.
  assert(f.minCropRequiredPx! <= 191 && 191 <= f.maxCropByFaceSharePx!);
});

// ═══ 8 — contamination ═══════════════════════════════════════════════════
Deno.test("PURE — 8. a track that jumps to another speaker is rejected", () => {
  const other: Box = [900, 400, 987, 524]; // same size, elsewhere on the plate
  const s = sanitize([{ t: 0, box: ANCHOR }, { t: 1, box: other }]);
  assertEquals(s.accepted.length, 1);
  assertEquals(s.rejectedCounts.not_chain_connected, 1);
  // …and it cannot enlarge the floor.
  assertEquals(feasibility([{ t: 0, box: ANCHOR }, { t: 1, box: other }]).minCropRequiredPx, 135);
});

Deno.test("PURE — 5/8. an entirely contaminated track fails closed", () => {
  const f = feasibility([
    { t: 0, box: [900, 400, 987, 524] },
    { t: 1, box: [950, 400, 1037, 524] },
  ]);
  assertEquals(f.feasible, false);
  assertEquals(f.sampleCount, 0);
  assertEquals(f.infeasibleReason, "no_coherent_track_samples");
  assertEquals(f.minCropRequiredPx, null);
});

Deno.test("PURE — a smear or two-face merge fails on its own geometry", () => {
  // Aspect ratio beyond what 0.24 and the 4 % pad can ever satisfy.
  const smear: Box = [300, 400, 340, 600]; // 40 x 200
  assert(requiredCropForSample(smear, PAD) > shareCapForSample(smear, FLOOR));
  assertEquals(sanitize([{ t: 0, box: smear }]).rejectedCounts.self_infeasible, 1);
});

// ═══ 9/10 — the legitimate controls ══════════════════════════════════════
Deno.test("PURE — 9. a genuine camera approach is accepted", () => {
  const closer: Box = [295, 390, 425, 576]; // ~1.5x, still overlapping
  const s = sanitize([{ t: 0, box: ANCHOR }, { t: 1, box: closer }]);
  assertEquals(s.accepted.length, 2, "legitimate growth must not be rejected");
  assertEquals(s.rejectedCounts.scale_incoherent_with_anchor, 0);
  const f = feasibility([{ t: 0, box: ANCHOR }, { t: 1, box: closer }]);
  assertEquals(f.feasible, true);
  // The bigger face raises the floor, the smaller one still sets the cap.
  assert(f.minCropRequiredPx! > 135);
});

Deno.test("PURE — 10. a genuinely un-croppable face still fails the floor", () => {
  // A face so elongated that no crop satisfies the share floor: thresholds
  // are preserved, not tuned.
  const impossible: Box = [300, 400, 330, 560]; // 30 x 160
  const s = sanitize([{ t: 0, box: impossible }], impossible);
  assertEquals(s.accepted.length, 0);
  assertEquals(s.rejectedCounts.self_infeasible, 1);
  const f = evaluateTrackFeasibility({ accepted: [], faceShareFloor: FLOOR, padRatio: PAD });
  assertEquals(f.feasible, false);
});

Deno.test("PURE — an incoherent PAIR still fails once both are accepted", () => {
  // Two coherent-with-anchor samples whose own bounds cannot meet: the
  // refusal survives, it is simply about one measurement now.
  const a: Box = [300, 400, 340, 440]; // 40 x 40  → cap 81
  const b: Box = [300, 400, 420, 520]; // 120x120  → required 131
  const f = evaluateTrackFeasibility({
    accepted: [{ box: a, t: 0 }, { box: b, t: 1 }],
    faceShareFloor: FLOOR,
    padRatio: PAD,
  });
  assertEquals(f.feasible, false);
  assert(f.infeasibleReason?.includes("track_min_crop"));
});

Deno.test("PURE — malformed samples are counted, never guessed at", () => {
  const s = sanitize([
    { t: 0, box: ANCHOR },
    { t: 1, box: [1, 2, 3] },
    { t: 2, box: [10, 10, 5, 5] },
    { t: 3, box: null },
    "nonsense",
  ]);
  assertEquals(s.accepted.length, 1);
  assertEquals(s.rejectedCounts.invalid_box, 4);
});

Deno.test("PURE — telemetry is bounded: counts, not per-sample arrays", () => {
  const s = sanitize([{ t: 0, box: ANCHOR }, { t: 1, box: INFLATED }]);
  const t = buildTrackFeasibilityTelemetry(
    s,
    evaluateTrackFeasibility({ accepted: s.accepted, faceShareFloor: FLOOR, padRatio: PAD }),
  );
  assertEquals(Object.keys(t).sort(), [
    "authority", "feasible", "infeasible_reason", "max_crop_by_face_share_px",
    "min_crop_required_px", "rejected_invalid_box", "rejected_not_chain_connected",
    "rejected_scale_incoherent", "rejected_self_infeasible", "samples_accepted",
    "samples_rejected", "version",
  ]);
  assert(!JSON.stringify(t).includes("://"));
  assert(JSON.stringify(t).length < 400, "telemetry must stay small on long turns");
});

// ═══ GEOMETRY — the real planner ═════════════════════════════════════════
Deno.test("GEOMETRY — 3. the planner interval is single-authority in dynamic mode", () => {
  const face = { bbox: ANCHOR, center: [343, 462] as [number, number], mouth: [343, 490] as [number, number] };
  const common = {
    face,
    plateWidth: 1080,
    plateHeight: 1920,
    targetFaceShare: 0.42,
    minSize: 128,
    outputSize: 720,
    faceShareFloor: FLOOR,
    perFrameMinCropPx: 269,
  };
  // BEFORE: the anchor cap (212) decided against a track floor (269).
  const before = computeMouthCenteredCrop(common);
  assertEquals(before.shareCapAuthority, "anchor_snapshot");
  assertEquals(before.feasible, false);
  assert(before.infeasibleReason?.includes("212"));

  // AFTER: the caller supplies the cap from the SAME samples.
  const after = computeMouthCenteredCrop({ ...common, dynamicShareCapPx: 504 });
  assertEquals(after.shareCapAuthority, "turn_track");
  assertEquals(after.effectiveShareCapPx, 504);
  assertEquals(after.feasible, true);
});

Deno.test("GEOMETRY — 8. the static regime is untouched", () => {
  const r = computeMouthCenteredCrop({
    face: { bbox: ANCHOR, center: [343, 462], mouth: [343, 490] },
    plateWidth: 1080,
    plateHeight: 1920,
    targetFaceShare: 0.42,
    minSize: 128,
    outputSize: 720,
    faceShareFloor: FLOOR,
    // No `perFrameMinCropPx` → static. A track cap must not apply.
    dynamicShareCapPx: 504,
  });
  assertEquals(r.feasibilityMode, "static");
  assertEquals(r.shareCapAuthority, "anchor_snapshot");
  assertEquals(r.effectiveShareCapPx, 212);
});

// ═══ CONTRACT — wiring ═══════════════════════════════════════════════════
const read = (rel: string) => Deno.readTextFileSync(new URL(rel, import.meta.url));
const codeOnly = (src: string) =>
  src.split(/\r?\n/).map((l) => {
    const t = l.trim();
    return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") ? "" : l;
  }).join("\n");

const PLANNER = codeOnly(read("./pass-face-preclip.ts"));
const CROP = codeOnly(read("./compute-mouth-centered-crop.ts"));
const DIALOG = codeOnly(read("../compose-dialog-segments/index.ts"));

Deno.test("CONTRACT — 7. no snapshot-vs-track comparison remains in dynamic mode", () => {
  // The feasibility verdict reads the effective cap, never the raw anchor one.
  assert(CROP.includes("const feasible = effectiveShareCapPx === null"));
  assertEquals(CROP.includes("const feasible = shareCap === null ? true : minCropRequiredPx <= shareCap;"), false);
  // And the caller feeds both ends from the accepted samples.
  assert(PLANNER.includes("sanitizeTurnTrackSamples({"));
  assert(PLANNER.includes("perFrameMinCropPx(v520Track.accepted.map((a) => a.box))"));
  assert(PLANNER.includes("dynamicShareCapPx: v520ShareCapPx,"));
});

Deno.test("CONTRACT — 5. a fully rejected track fails closed, never reverts", () => {
  assert(PLANNER.includes("if (v520ClaimedTrack && v520Track.accepted.length === 0) {"));
  const at = PLANNER.indexOf("v520_track_all_rejected");
  assert(at > 0);
  assert(PLANNER.slice(at, at + 900).includes("no_coherent_track_samples"));
});

Deno.test("CONTRACT — 11/13. the early fence uses the SAME authority as the late one", () => {
  // Before V520 this checkpoint asked only `isFanoutClosed`; the late gate
  // asked `mayDispatchProvider`, which also consults `isRunTerminal`.
  const early = DIALOG.indexOf("const v520EarlyGate = mayDispatchProvider({");
  const late = DIALOG.indexOf("const lateGate = mayDispatchProvider({");
  assert(early > 0 && late > 0);
  assert(early < late, "the new fence must come first");
  assert(DIALOG.includes("v520_early_run_terminal"));
  // The existing fan-out skip label is preserved exactly.
  assert(DIALOG.includes('? "v459_fanout_closed"'));
});

Deno.test("CONTRACT — 10. no threshold was touched", () => {
  const gate = read("./v461-face-gate.ts");
  assert(gate.includes("export const V461_FACE_SHARE_FLOOR = 0.24;"));
  assert(gate.includes("export const V461_FACE_SIZE_PROVIDER_PX_FLOOR = 144;"));
  assertEquals(gate.includes("v520"), false);
  assertEquals(read("./dynamic-camera-path.ts").includes("CONTAINMENT_PAD_RATIO = 0.04"), true);
});

Deno.test("CONTRACT — 9. V519, V516 and V518 are untouched", () => {
  for (const rel of ["./v516-mouth-coherence.ts", "./durable-scene-output.ts", "./lkg-output.ts"]) {
    assertEquals(read(rel).includes("v520"), false, `${rel} must not reference v520`);
    assertEquals(read(rel).includes("V520"), false);
  }
  // V519's dynamic containment still decides containment, not feasibility.
  assert(read("./preclip-crop-containment.ts").includes("evaluateDynamicPreclipContainment"));
  assertEquals(read("./preclip-crop-containment.ts").includes("V520"), false);
});
