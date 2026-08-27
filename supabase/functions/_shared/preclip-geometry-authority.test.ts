/**
 * V510-P1 — CONTRACT-E GEOMETRY AUTHORITY
 *
 * Two production runs terminalized on `preclip_identity_geometry_mismatch`
 * while the rendered crop did contain the tracked face. The gate arithmetic
 * was correct; its referent was not. Every fixture below is the exact
 * production geometry, so a regression reproduces the incident rather than a
 * paraphrase of it.
 *
 *   PURE     — executes the decision logic and the real Contract-E gate.
 *   CONTRACT — asserts wiring in compose-dialog-segments, where no unit test
 *              can reach.
 */

import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  buildGeometryAuthorityTelemetry,
  type Box,
  resolvePreclipContainmentAuthority,
} from "./preclip-geometry-authority.ts";
import { evaluatePreclipCropContainment } from "./preclip-crop-containment.ts";
import {
  buildPerFrameAsdBoxes,
  projectPlateBoxToPreclip,
} from "./v464-asd-projection.ts";

// ── Production fixture 1 — generation 10, Matthew Dusatko, pass 4 ─────────
const GEN10 = {
  staticPlateBbox: [469, 526, 513, 586] as Box,
  staticDispatchBox: [465, 522, 517, 588] as Box,
  plannerContainBox: [474, 528, 541, 602] as Box,
  crop: { x: 446, y: 528, size: 104, outputSize: 720 },
  track: [
    [479, 539, 522, 599], [479, 540, 522, 599], [479, 539, 522, 599],
    [483, 533, 527, 594], [487, 532, 532, 592], [490, 532, 536, 593],
  ] as Box[],
  trackUnion: [479, 532, 536, 599] as Box,
};

// ── Production fixture 2 — generation 11, Sarah Dusatko, pass 0 ───────────
const GEN11 = {
  staticPlateBbox: [237, 110, 358, 286] as Box,
  staticDispatchBox: [227, 99, 368, 293] as Box,
  plannerContainBox: [230, 103, 387, 321] as Box,
  crop: { x: 201, y: 103, size: 272, outputSize: 720 },
};

const resolve = (f: { plannerContainBox: Box; staticDispatchBox: Box }, source: "turn_track" | "anchor") =>
  resolvePreclipContainmentAuthority({
    plannerContainBox: f.plannerContainBox,
    plannerContainSource: source,
    staticDispatchBox: f.staticDispatchBox,
  });

// ═══ 1 — Generation 10 admits ════════════════════════════════════════════
Deno.test("PURE — 1. gen-10 Matthew: the tracked target passes, the static one did not", () => {
  // The failure, reproduced exactly: 6 px of top overhang on a box nobody
  // rendered. crop top = 528, static target top = 522.
  const legacy = evaluatePreclipCropContainment({
    crop: GEN10.crop, targetBbox: GEN10.staticDispatchBox, otherSpeakerCenters: [],
  });
  assertEquals(legacy.ok, false);
  assertEquals(legacy.reason, "target_not_contained_in_crop");
  assertEquals(GEN10.crop.y - GEN10.staticDispatchBox[1], 6, "the production overhang was 6 px");

  const a = resolve(GEN10, "turn_track");
  assertEquals(a.source, "track_planner");
  assertEquals(a.targetBox, GEN10.plannerContainBox);

  const fixed = evaluatePreclipCropContainment({
    crop: GEN10.crop, targetBbox: a.targetBox, otherSpeakerCenters: [],
  });
  assert(fixed.ok, `still refused: ${fixed.reason} ${fixed.detail ?? ""}`);
  // Admitted by containment, not by tolerance: the box is strictly inside.
  const [x1, y1, x2, y2] = a.targetBox;
  assert(x1 >= GEN10.crop.x && y1 >= GEN10.crop.y);
  assert(x2 <= GEN10.crop.x + GEN10.crop.size && y2 <= GEN10.crop.y + GEN10.crop.size);
});

// ═══ 2 — Generation 11 admits ════════════════════════════════════════════
Deno.test("PURE — 2. gen-11 Sarah: the tracked target passes, the static one did not", () => {
  const legacy = evaluatePreclipCropContainment({
    crop: GEN11.crop, targetBbox: GEN11.staticDispatchBox, otherSpeakerCenters: [],
  });
  assertEquals(legacy.ok, false);
  assertEquals(legacy.reason, "target_not_contained_in_crop");
  assertEquals(GEN11.crop.y - GEN11.staticDispatchBox[1], 4, "the production overhang was 4 px");

  const a = resolve(GEN11, "turn_track");
  const fixed = evaluatePreclipCropContainment({
    crop: GEN11.crop, targetBbox: a.targetBox, otherSpeakerCenters: [],
  });
  assert(fixed.ok, `still refused: ${fixed.reason} ${fixed.detail ?? ""}`);
  assertEquals(a.targetBox, GEN11.plannerContainBox);
});

// ═══ 3 — no track: byte-for-byte legacy ══════════════════════════════════
Deno.test("PURE — 3. without a track the authority IS the static box", () => {
  const a = resolve(GEN10, "anchor");
  assertEquals(a.source, "static_anchor");
  assertEquals(a.targetBox, GEN10.staticDispatchBox);
  assertEquals(a.authorityMatch, false);
  assertEquals(a.fallbackReason, "planner_used_anchor");

  // And the gate verdict is identical to the one it gave before this change,
  // failure included: the anchor-only class is not silently rescued.
  const before = evaluatePreclipCropContainment({
    crop: GEN10.crop, targetBbox: GEN10.staticDispatchBox, otherSpeakerCenters: [],
  });
  const after = evaluatePreclipCropContainment({
    crop: GEN10.crop, targetBbox: a.targetBox, otherSpeakerCenters: [],
  });
  assertEquals(JSON.stringify(after), JSON.stringify(before));

  // A comfortably-contained anchor case stays admitted, with the same clipBox.
  const roomy = { x: 440, y: 500, size: 160, outputSize: 720 };
  const ba = evaluatePreclipCropContainment({
    crop: roomy, targetBbox: GEN10.staticDispatchBox, otherSpeakerCenters: [],
  });
  const aa = evaluatePreclipCropContainment({
    crop: roomy,
    targetBbox: resolve(GEN10, "anchor").targetBox,
    otherSpeakerCenters: [],
  });
  assert(ba.ok && aa.ok);
  assertEquals(aa.clipBox, ba.clipBox, "no-track dispatch geometry must not move");
});

// ═══ 4 — a tracked target genuinely outside still fails ══════════════════
Deno.test("PURE — 4. a track-derived target outside the crop still fails", () => {
  // Same crop, but the planner target shifted below the crop's bottom edge.
  const outside: Box = [474, 560, 541, 640];
  assert(outside[3] > GEN10.crop.y + GEN10.crop.size);
  const a = resolvePreclipContainmentAuthority({
    plannerContainBox: outside,
    plannerContainSource: "turn_track",
    staticDispatchBox: GEN10.staticDispatchBox,
  });
  assertEquals(a.source, "track_planner");
  const r = evaluatePreclipCropContainment({
    crop: GEN10.crop, targetBbox: a.targetBox, otherSpeakerCenters: [],
  });
  assertEquals(r.ok, false);
  assertEquals(r.reason, "target_not_contained_in_crop");
});

// ═══ 5 — E.3 sibling exclusion is untouched ══════════════════════════════
Deno.test("PURE — 5. a sibling centre inside the tracked target still fails", () => {
  const a = resolve(GEN10, "turn_track");
  // A second speaker whose assignment-locked centre lands inside the tracked
  // region. Identity still comes from the static map; only the region moved.
  const siblingCentre: [number, number] = [
    Math.round((a.targetBox[0] + a.targetBox[2]) / 2),
    Math.round((a.targetBox[1] + a.targetBox[3]) / 2),
  ];
  const r = evaluatePreclipCropContainment({
    crop: GEN10.crop, targetBbox: a.targetBox, otherSpeakerCenters: [siblingCentre],
  });
  assertEquals(r.ok, false);
  assertEquals(r.reason, "other_speaker_center_in_target");

  // A sibling safely outside stays admitted.
  const far = evaluatePreclipCropContainment({
    crop: GEN10.crop, targetBbox: a.targetBox, otherSpeakerCenters: [[450, 630]],
  });
  assert(far.ok, `unexpected refusal: ${far.reason}`);
});

// ═══ 6/7 — structural refusals unchanged ═════════════════════════════════
Deno.test("PURE — 6/7. invalid crop and degenerate transform still fail", () => {
  const a = resolve(GEN10, "turn_track");
  for (const bad of [
    { x: 446, y: 528, size: 0, outputSize: 720 },
    { x: 446, y: 528, size: 104, outputSize: 0 },
    { x: NaN, y: 528, size: 104, outputSize: 720 },
  ]) {
    assertEquals(
      evaluatePreclipCropContainment({ crop: bad, targetBbox: a.targetBox, otherSpeakerCenters: [] }).reason,
      "invalid_crop",
    );
  }
  // A target that survives E.1 but collapses under the transform.
  const tiny = { x: 446, y: 528, size: 100000, outputSize: 8 };
  const r = evaluatePreclipCropContainment({
    crop: tiny, targetBbox: a.targetBox, otherSpeakerCenters: [],
  });
  assertEquals(r.ok, false);
  assert(
    r.reason === "transform_degenerate" || r.reason === "transform_out_of_bounds",
    `unexpected reason ${r.reason}`,
  );
  // A degenerate target is still rejected before anything else.
  assertEquals(
    evaluatePreclipCropContainment({
      crop: GEN10.crop, targetBbox: [500, 540, 500, 540], otherSpeakerCenters: [],
    }).reason,
    "invalid_target_bbox",
  );
});

// ═══ 8 — the planner's choice is the authority, not the array's existence ═
Deno.test("PURE — 8. a measured track the planner did not use grants no authority", () => {
  // The pipeline has been burned by inferring intent from the presence of
  // data. Authority follows `containSource`, which is the planner's own
  // verdict about what it proved.
  const a = resolvePreclipContainmentAuthority({
    plannerContainBox: GEN10.plannerContainBox,
    plannerContainSource: "anchor",
    staticDispatchBox: GEN10.staticDispatchBox,
  });
  assertEquals(a.source, "static_anchor");
  assertEquals(a.targetBox, GEN10.staticDispatchBox);

  // Missing or malformed planner boxes fall back rather than throw.
  for (
    const [boxIn, reason] of [
      [null, "no_planner_contain_box"],
      [undefined, "no_planner_contain_box"],
      [[1, 2, 3] as unknown as Box, "planner_contain_box_invalid"],
      [[10, 10, 10, 10] as Box, "planner_contain_box_invalid"],
      [[10, 10, 5, 20] as Box, "planner_contain_box_invalid"],
      [[NaN, 1, 2, 3] as unknown as Box, "planner_contain_box_invalid"],
    ] as Array<[Box | null | undefined, string]>
  ) {
    const f = resolvePreclipContainmentAuthority({
      plannerContainBox: boxIn,
      plannerContainSource: "turn_track",
      staticDispatchBox: GEN10.staticDispatchBox,
    });
    assertEquals(f.source, "static_anchor");
    assertEquals(f.fallbackReason, reason);
    assertEquals(f.targetBox, GEN10.staticDispatchBox);
  }
});

// ═══ 9 — the rule is geometric, not situational ══════════════════════════
Deno.test("PURE — 9. the same rule applies to a static-equivalent and a moving camera", () => {
  // A static-equivalent path and a genuinely dynamic one resolve identically:
  // the policy reads `containSource` and nothing else. It cannot depend on
  // cameraPath.moving, generation number or speaker name — none is an input.
  const staticEq = resolve(GEN10, "turn_track");
  const dynamic = resolve(GEN11, "turn_track");
  assertEquals(staticEq.source, "track_planner");
  assertEquals(dynamic.source, "track_planner");

  const keys = Object.keys(
    resolvePreclipContainmentAuthority({
      plannerContainBox: GEN10.plannerContainBox,
      plannerContainSource: "turn_track",
      staticDispatchBox: GEN10.staticDispatchBox,
    }),
  ).sort();
  assertEquals(keys, [
    "authorityMatch", "fallbackReason", "plannerContainBox",
    "source", "staticDispatchBox", "targetBox",
  ]);
});

// ═══ 10 — the invariant ══════════════════════════════════════════════════
Deno.test("PURE — 10. the box the planner proved IS the box Contract E tests", () => {
  for (const f of [GEN10, GEN11]) {
    const a = resolve(f, "turn_track");
    assertEquals(a.targetBox, a.plannerContainBox, "authority must be the planner's own box");
    assertEquals(a.authorityMatch, true);
    const t = buildGeometryAuthorityTelemetry(a);
    assertEquals(t.contract_e_geometry_source, "track_planner");
    assertEquals(t.contract_e_target_box, f.plannerContainBox);
    assertEquals(t.authority_match, true);
    // Bounded and URL-free.
    assert(!JSON.stringify(t).includes("http"));
    assertEquals(Object.keys(t).length, 7);
  }
  // In the static regime the two derivations normally agree; the telemetry
  // reports that rather than assuming it.
  const s = buildGeometryAuthorityTelemetry(
    resolvePreclipContainmentAuthority({
      plannerContainBox: GEN10.staticDispatchBox,
      plannerContainSource: "anchor",
      staticDispatchBox: GEN10.staticDispatchBox,
    }),
  );
  assertEquals(s.static_regime_boxes_agree, true);
});

// ═══ 11 — downstream: dispatchBox and the V464 anchor pair ═══════════════
Deno.test("PURE — 11. the V464 anchor pair describes ONE face, so margins are zero", () => {
  for (const f of [GEN10, GEN11]) {
    const a = resolve(f, "turn_track");
    const e = evaluatePreclipCropContainment({
      crop: f.crop, targetBbox: a.targetBox, otherSpeakerCenters: [],
    });
    assert(e.ok);
    // Contract E's E.4 transform and projectPlateBoxToPreclip must agree, or
    // the anchor pair would silently describe two boxes again.
    const projected = projectPlateBoxToPreclip(a.targetBox, f.crop);
    assertEquals(
      e.clipBox,
      projected,
      "Contract E's transform must equal the V464 projection of the same box",
    );
  }
});

Deno.test("PURE — 11b. gen-10 V464 registration stays valid on the admitted target", () => {
  const a = resolve(GEN10, "turn_track");
  const e = evaluatePreclipCropContainment({
    crop: GEN10.crop, targetBbox: a.targetBox, otherSpeakerCenters: [],
  });
  assert(e.ok);

  const fps = 24;
  const built = buildPerFrameAsdBoxes({
    frameCount: 12,
    fps,
    staticCrop: GEN10.crop,
    cameraPath: null,
    faceTrack: GEN10.track.map((box, i) => ({ t: i * 0.2, box })),
    preclipStartSec: 0,
    // Both halves of the pair are now the SAME box: the authority and its own
    // projection. This is what keeps `marginsOf` describing one face.
    anchorPlateBox: a.targetBox,
    anchorDispatchBox: e.clipBox!,
    voicedWindowsSec: [[0, 12 / fps]],
  });

  assertEquals(built.registration, "per_frame");
  assertEquals(built.trackSource, "face_track");
  assertEquals(built.marginPolicy, "track_expansion_only");
  // Zero raw margins — nothing to clamp, so V509's clamp is inert here.
  assertEquals(built.rawAnchorMargins, [0, 0, 0, 0]);
  assertEquals(built.appliedMargins, [0, 0, 0, 0]);
  assertEquals(built.negativeMarginsClamped, false);
  assertEquals(built.frameBoxes.length, 12);

  // And the emitted boxes still hold the tracked face on every frame — the
  // V509 property must survive the new anchor.
  for (let i = 0; i < built.frameBoxes.length; i++) {
    const [bx1, by1, bx2, by2] = built.frameBoxes[i];
    assert(bx2 > bx1 && by2 > by1, `frame ${i} degenerate`);
    const [mx, my] = built.frameMouths[i];
    assert(
      mx >= bx1 && mx <= bx2 && my >= by1 && my <= by2,
      `frame ${i} mouth [${mx},${my}] outside box [${bx1},${by1},${bx2},${by2}]`,
    );
  }
});

// ═══ CONTRACT — the wiring in compose-dialog-segments ════════════════════
const COMPOSE = Deno.readTextFileSync(
  new URL("../compose-dialog-segments/index.ts", import.meta.url),
);
const PLANNER = Deno.readTextFileSync(new URL("./pass-face-preclip.ts", import.meta.url));

Deno.test("CONTRACT — Contract E is called with the authority, never the raw static box", () => {
  // V519 renamed the binding (`v519Static`) because the regime now selects
  // between a static and a dynamic verdict. The invariant is unchanged and is
  // what this asserts: the evaluator judges the AUTHORITY box, never the raw
  // static one, and there is exactly one Contract-E call site.
  const call = COMPOSE.indexOf("evaluatePreclipCropContainment({");
  assert(call > 0);
  const args = COMPOSE.slice(call, call + 260);
  assert(args.includes("targetBbox: v510p1Authority.targetBox,"), "the gate must judge the authority");
  assert(!args.includes("targetBbox: box,"), "the static box may no longer be the target");
  // Exactly one Contract-E call site, so there is no second, unconverted gate.
  assertEquals(COMPOSE.split("evaluatePreclipCropContainment({").length - 1, 1);
});

Deno.test("CONTRACT — identity stays static: E.3 centres still come from the assignment map", () => {
  const at = COMPOSE.indexOf("const otherCenters: Array<[number, number]> = [];");
  assert(at > 0);
  const block = COMPOSE.slice(at, COMPOSE.indexOf("const v510p1Authority"));
  assert(block.includes("speakerPlateBboxes?.[si]"), "sibling identity must remain the static map");
  assert(!block.includes("containBox"), "no track geometry may leak into identity");
  assert(!block.includes("faceTrack"));
  // The track never renames a speaker: assignment stays the identity source.
  assert(COMPOSE.includes("otherSpeakerCenters: otherCenters,"));
});

Deno.test("CONTRACT — the V464 anchor pair is anchored on the same authority", () => {
  assert(COMPOSE.includes("anchorPlateBox: v510p1AnchorPlateBox as [number, number, number, number],"));
  assert(COMPOSE.includes("v510p1AnchorPlateBox = v510p1Authority.targetBox;"));
  // It defaults to the static box, so the non-preclip and no-track paths are
  // untouched.
  assert(COMPOSE.includes("let v510p1AnchorPlateBox: [number, number, number, number] | null = box;"));
  // The adoption happens only on a containment SUCCESS branch.
  //
  // V522 — a proven dynamic pass adopts the same anchor without ever
  // producing a static clip box, so there are two adoption sites now. The
  // property is unchanged and is what gets asserted: both sit after the
  // failure branch, one in each success branch, and neither can be reached
  // while `containment.ok` is false.
  const adopts = [...COMPOSE.matchAll(/v510p1AnchorPlateBox = v510p1Authority.targetBox;/g)]
    .map((m) => m.index ?? -1);
  assertEquals(adopts.length, 2, "one per success branch");
  const fail = COMPOSE.indexOf("if (!containment.ok) {");
  const perFrame = COMPOSE.indexOf("} else if (v522PerFrameOnly) {");
  const ok = COMPOSE.indexOf("Contract E.5 — the wire box IS the transformed target bbox.");
  assert(fail > 0 && perFrame > fail && ok > perFrame, "failure branch comes first");
  assert(
    adopts[0] > perFrame && adopts[0] < ok,
    "the V522 per-frame adoption is inside the dynamic success branch",
  );
  assert(adopts[1] > ok, "the static adoption is inside the Contract-E success branch");
});

Deno.test("CONTRACT — the planner exposes its source without changing its behaviour", () => {
  assert(PLANNER.includes('containSource?: "turn_track" | "anchor" | null;'));
  assertEquals(PLANNER.split("containSource: v461ContainSource,").length - 1, 2, "both return paths");
  // The planner's own decision is untouched: still exactly one assignment.
  assertEquals(
    PLANNER.split('const v461ContainSource: "turn_track" | "anchor" = v461TurnUnion ? "turn_track" : "anchor";').length - 1,
    1,
  );
  assertEquals(
    PLANNER.split("buildDispatchFaceBox(v461TurnUnion ?? bbox ?? null").length - 1,
    1,
    "the planner's target derivation must not have moved",
  );
});

Deno.test("CONTRACT — telemetry names the referent on both success and failure", () => {
  assert(COMPOSE.includes("(pass as any).v510p1_geometry_authority = v510p1Telemetry;"));
  assert(COMPOSE.includes("v510p1_geometry_authority source="));
  // The failure meta carries it too, so a future mismatch names its box.
  const failMeta = COMPOSE.indexOf("fa4_containment_reason: containment.reason,");
  assert(failMeta > 0);
  assert(COMPOSE.slice(failMeta, failMeta + 600).includes("...v510p1Telemetry,"));
});
