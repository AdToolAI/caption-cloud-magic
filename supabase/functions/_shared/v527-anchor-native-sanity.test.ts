/**
 * V527 — ANCHOR-NATIVE FACE-SIZE SANITY (space-authority fix).
 *
 * Generation 25 refunded a customer for "faces too small for lip-sync" on a
 * shot whose faces were not too small. DetectFaces had inspected the
 * 704x1510 anchor still; the normalized boxes it returned were denormalized
 * with the 656x1406 base-video dimensions, and the 40 px floor was then
 * applied to that shrunken number.
 *
 * These tests pin the rule rather than the incident: a pixel measurement is
 * only a statement about the raster it was measured in.
 */
import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  denormalizeFaceBox,
  resolveDimensionAuthority,
} from "./plateFaceSlotRouter.ts";
import {
  assignAnchorsToCandidatesBijective,
  filterPlausibleCandidates,
  PLATE_FACE_SANITY,
  plateFaceSanity,
} from "./plate-face-candidates.ts";

// Gen25 production geometry.
const ANCHOR = { width: 704, height: 1510 };
const PLATE = { width: 656, height: 1406 };

/** The face that was rejected at 38 px. */
const GEN25_FACE = { Left: 0.40, Top: 0.30, Width: 0.058, Height: 0.045 };
/** The three faces that passed in either space. */
const GEN25_OTHERS = [
  { Left: 0.10, Top: 0.28, Width: 0.075, Height: 0.058 },
  { Left: 0.55, Top: 0.29, Width: 0.075, Height: 0.058 },
  { Left: 0.75, Top: 0.31, Width: 0.075, Height: 0.058 },
];

const centerOf = (n: { Left: number; Top: number; Width: number; Height: number }) =>
  ({ cx: n.Left + n.Width / 2, cy: n.Top + n.Height / 2 });

const candidatesIn = (
  norms: Array<{ Left: number; Top: number; Width: number; Height: number }>,
  dims: { width: number; height: number },
) => norms.map((n, i) => ({ index: i, bbox: denormalizeFaceBox(n, dims), ...centerOf(n) }));

// 1 — the old, plate-space measurement reproduces the false failure.
Deno.test("V527 — Gen25: plate-space measurement produces the false 38px rejection", () => {
  const box = denormalizeFaceBox(GEN25_FACE, PLATE);
  const s = plateFaceSanity(box, PLATE);
  assertEquals(box, [262, 422, 300, 485]);
  assertEquals(s.shortSidePx, 38);
  assertEquals(s.ok, false);
  assertEquals(s.reason, "face_too_small_for_lipsync");
});

// 2 — the SAME normalized face passes in the space that was detected.
Deno.test("V527 — Gen25: the same normalized face passes in anchor-native space", () => {
  const box = denormalizeFaceBox(GEN25_FACE, ANCHOR);
  const s = plateFaceSanity(box, ANCHOR);
  assertEquals(box, [282, 453, 322, 521]);
  assertEquals(s.shortSidePx, 40);
  assertEquals(s.ok, true);
  assertEquals(s.reason, "ok");
  // The unrounded truth the incident report quoted.
  assert(Math.abs(GEN25_FACE.Width * ANCHOR.width - 40.83) < 0.01);
  assert(Math.abs(GEN25_FACE.Width * PLATE.width - 38.05) < 0.01);
});

// 3 — the threshold itself is untouched.
Deno.test("V527 — threshold frozen at exactly 40 px, no tolerance band", () => {
  assertEquals(PLATE_FACE_SANITY.minFaceShortSidePx, 40);
  // 39 still fails in the detection space. No epsilon was introduced.
  const tooSmall = plateFaceSanity([100, 100, 139, 200], ANCHOR);
  assertEquals(tooSmall.shortSidePx, 39);
  assertEquals(tooSmall.ok, false);
  assertEquals(tooSmall.reason, "face_too_small_for_lipsync");
  // 40 is the first accepted value — the gate is `< 40`, not `<= 40`.
  const exactly = plateFaceSanity([100, 100, 140, 200], ANCHOR);
  assertEquals(exactly.shortSidePx, 40);
  assertEquals(exactly.ok, true);
});

// 4 — projection into plate space is unchanged and still happens.
Deno.test("V527 — accepted faces are still projected into plate dimensions", () => {
  const detection = denormalizeFaceBox(GEN25_FACE, ANCHOR);
  const projection = denormalizeFaceBox(GEN25_FACE, PLATE);
  assertNotEquals(detection, projection);
  // Downstream keeps receiving exactly what it received before V527:
  // the normalized box denormalized with plateDims.
  assertEquals(projection, [262, 422, 300, 485]);
  // Sanity accepted it, projection shrank it — both are true at once, and
  // that is the point: the gate is not the projection.
  assertEquals(plateFaceSanity(detection, ANCHOR).ok, true);
});

// 5 — normalized geometry survives the round trip.
Deno.test("V527 — normalized center is preserved through projection", () => {
  for (const n of [GEN25_FACE, ...GEN25_OTHERS]) {
    for (const dims of [ANCHOR, PLATE, { width: 1920, height: 1080 }]) {
      const [x1, y1, x2, y2] = denormalizeFaceBox(n, dims);
      const cx = (x1 + (x2 - x1) / 2) / dims.width;
      const cy = (y1 + (y2 - y1) / 2) / dims.height;
      // Rounding is at most half a pixel per corner.
      assert(Math.abs(cx - centerOf(n).cx) < 1 / dims.width);
      assert(Math.abs(cy - centerOf(n).cy) < 1 / dims.height);
    }
  }
});

// 6 — anchor LARGER than plate: sanity uses anchor dims.
Deno.test("V527 — anchor larger than plate: sanity uses the anchor raster", () => {
  const a = resolveDimensionAuthority(ANCHOR, PLATE)!;
  assertEquals(a.detectionDims, ANCHOR);
  assertEquals(a.projectionDims, PLATE);
  const inDetection = filterPlausibleCandidates(
    candidatesIn([GEN25_FACE], a.detectionDims),
    a.detectionDims,
  );
  assertEquals(inDetection.plausible.length, 1);
  assertEquals(inDetection.measurements[0].shortSidePx, 40);
});

// 7 — anchor SMALLER than plate: the rule is not a one-way loosening.
Deno.test("V527 — anchor smaller than plate: sanity still uses the anchor raster", () => {
  const smallAnchor = { width: 656, height: 1406 };
  const bigPlate = { width: 1920, height: 1080 };
  const a = resolveDimensionAuthority(smallAnchor, bigPlate)!;
  assertEquals(a.detectionDims, smallAnchor);
  assertEquals(a.projectionDims, bigPlate);
  // In the big landscape plate space this face would look like a comfortable
  // 49 px short side (111 px wide, 49 px tall) and sail through the gate.
  assertEquals(
    plateFaceSanity(denormalizeFaceBox(GEN25_FACE, bigPlate), bigPlate).shortSidePx,
    49,
  );
  // It is 38 px in the raster that was actually inspected, so it is rejected.
  const res = filterPlausibleCandidates(
    candidatesIn([GEN25_FACE], a.detectionDims),
    a.detectionDims,
  );
  assertEquals(res.plausible.length, 0);
  assertEquals(res.rejected[0].reason, "face_too_small_for_lipsync");
});

// 8 — equal dimensions: nothing changes.
Deno.test("V527 — equal dimensions leave the result identical", () => {
  const a = resolveDimensionAuthority(PLATE, PLATE)!;
  assertEquals(a.detectionDims, a.projectionDims);
  assertEquals(
    denormalizeFaceBox(GEN25_FACE, a.detectionDims),
    denormalizeFaceBox(GEN25_FACE, a.projectionDims),
  );
  assertEquals(plateFaceSanity(denormalizeFaceBox(GEN25_FACE, PLATE), PLATE).ok, false);
});

// 9 — detection dims unavailable: fail closed, never borrow.
Deno.test("V527 — unusable detection dims fail closed instead of borrowing plateDims", () => {
  assertEquals(resolveDimensionAuthority(null, PLATE), null);
  assertEquals(resolveDimensionAuthority(undefined, PLATE), null);
  assertEquals(resolveDimensionAuthority({ width: 0, height: 1406 }, PLATE), null);
  assertEquals(resolveDimensionAuthority({ width: 704, height: -1 }, PLATE), null);
  assertEquals(resolveDimensionAuthority({ width: NaN, height: 1406 }, PLATE), null);
  // A missing PROJECTION target is not fatal — the detection raster is then
  // also the destination. The substitution is only ever allowed this way.
  const a = resolveDimensionAuthority(ANCHOR, null)!;
  assertEquals(a.projectionDims, ANCHOR);
});

// 10 — Gen25 end to end: 4/4 routable in the detection space.
Deno.test("V527 — Gen25 cast: anchor=4/plausible=3 in plate space, 4/4 in anchor space", () => {
  const all = [GEN25_OTHERS[0], GEN25_OTHERS[1], GEN25_FACE, GEN25_OTHERS[2]];
  const anchorSlots = all.map(centerOf);

  // What production did.
  const wrong = filterPlausibleCandidates(candidatesIn(all, PLATE), PLATE);
  assertEquals(wrong.plausible.length, 3);
  assertEquals(wrong.rejected.length, 1);
  assertEquals(wrong.rejected[0].reason, "face_too_small_for_lipsync");
  const wrongAssign = assignAnchorsToCandidatesBijective(
    anchorSlots,
    wrong.plausible.map((p) => ({ cx: p.cx, cy: p.cy })),
  );
  assertEquals(wrongAssign.ok, false);
  assertEquals(wrongAssign.reason, "count_mismatch");

  // What V527 does.
  const right = filterPlausibleCandidates(candidatesIn(all, ANCHOR), ANCHOR);
  assertEquals(right.plausible.length, 4);
  assertEquals(right.rejected.length, 0);
  const rightAssign = assignAnchorsToCandidatesBijective(
    anchorSlots,
    right.plausible.map((p) => ({ cx: p.cx, cy: p.cy })),
  );
  assertEquals(rightAssign.ok, true);
  assertEquals(rightAssign.assign.length, 4);
});

// 11 — a genuinely small anchor face still fails.
Deno.test("V527 — a face that is genuinely too small in the anchor still fails", () => {
  const tiny = { Left: 0.40, Top: 0.30, Width: 0.030, Height: 0.030 };
  const box = denormalizeFaceBox(tiny, ANCHOR);
  const s = plateFaceSanity(box, ANCHOR);
  assertEquals(s.shortSidePx, 21);
  assertEquals(s.ok, false);
  assertEquals(s.reason, "face_too_small_for_lipsync");
  const res = filterPlausibleCandidates(candidatesIn([tiny], ANCHOR), ANCHOR);
  assertEquals(res.plausible.length, 0);
});

// 12 — audit: which sanity metrics were actually space-dependent.
Deno.test("V527 — audit: shortSidePx is the only scale-dependent sanity metric", () => {
  const inAnchor = plateFaceSanity(denormalizeFaceBox(GEN25_FACE, ANCHOR), ANCHOR);
  const inPlate = plateFaceSanity(denormalizeFaceBox(GEN25_FACE, PLATE), PLATE);
  // Absolute pixels: differ. This was the bug.
  assertNotEquals(inAnchor.shortSidePx, inPlate.shortSidePx);
  // Ratios: invariant under the rescale, so they carried no space error.
  assert(Math.abs(inAnchor.areaRatio - inPlate.areaRatio) < 5e-5);
  assert(Math.abs(inAnchor.aspect - inPlate.aspect) < 0.02);
  // The in-raster tolerance is self-consistent: it is derived from the same
  // dims the box was denormalized in, so it is correct in either space and
  // becomes correct in the RIGHT space once the pair travels together.
  assertEquals(inAnchor.reason, "ok");
  assertEquals(inPlate.reason, "face_too_small_for_lipsync");
  // The percentage floor stays warn-only in both spaces (V507).
  assertEquals(inAnchor.warnings, ["area_too_small"]);
});

// 13 — V526-B and the sanity contract are untouched.
Deno.test("V527 — V526-B public surface unchanged", async () => {
  const m = await import("./v526b-common-frame-identity.ts");
  for (
    const fn of [
      "planCommonFrameCompletion",
      "buildStepFrames",
      "completeCommonFrameCohort",
      "buildCommonFrameTelemetry",
    ]
  ) {
    assertEquals(typeof (m as any)[fn], "function", `missing ${fn}`);
  }
  // V527 touches no threshold anywhere in the sanity contract.
  assertEquals(PLATE_FACE_SANITY.minAreaRatio, 0.003);
  assertEquals(PLATE_FACE_SANITY.maxAreaRatio, 0.25);
  assertEquals(PLATE_FACE_SANITY.minAspect, 0.4);
  assertEquals(PLATE_FACE_SANITY.maxAspect, 2.5);
  assertEquals(PLATE_FACE_SANITY.inPlateTolPct, 0.05);
});
