import { assertAlmostEquals, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveV471MouthRoi, V471_FACE_MOUTH_Y_RATIO } from "./v471-mouth-roi.ts";
import { evaluateMouthRoiContract, FACE_MOUTH_Y_RATIO } from "./v456-roi-contract.ts";

// Real persisted geometry of scene be60d106… run 95b11254… gen-15.
const P1 = {
  faceBbox: [260, 195, 340, 317],
  crop: { x: 206, y: 188, size: 188 },
  faceShareInCrop: 0.2761430511543685,
  mouthOffset: { dx: 0, dy: 8 },
  mouthSource: "pose_estimate",
};
const P2 = {
  faceBbox: [522, 177, 594, 286],
  crop: { x: 474, y: 170, size: 168 },
  faceShareInCrop: 0.2780612244897959,
  mouthOffset: { dx: 0, dy: 8 },
  mouthSource: "pose_estimate",
};

// V477 — the pose-estimate path is now a pure LAST-RESORT fallback: V476 proved
// the 0.88 ratio only existed to compensate for the crop being centred on the
// pose estimate instead of the measured landmark. With the landmark authority
// in place the fallback returns to the single validated ratio (0.78).
Deno.test("V477 — pose_estimate fallback uses the one validated ratio (0.78)", () => {
  const expected = {
    // (195 + 0.78 × 122 − 188) / 188
    P1: (195 + V471_FACE_MOUTH_Y_RATIO * (317 - 195) - 188) / 188,
    // (177 + 0.78 × 109 − 170) / 168
    P2: (177 + V471_FACE_MOUTH_Y_RATIO * (286 - 177) - 170) / 168,
  };
  for (const [label, g] of [["P1", P1], ["P2", P2]] as const) {
    const r = resolveV471MouthRoi(g);
    assertEquals(r.anchorSource, "face_ratio", label);
    assertAlmostEquals(r.roi!.centerY, expected[label], 1e-6, label);
  }
});


Deno.test("V471 — band is tightened to the edit-map size (~0.28 × 0.12)", () => {
  const r = resolveV471MouthRoi(P1);
  assertAlmostEquals(r.roi!.width, 0.28, 0.02);
  assertAlmostEquals(r.roi!.height, 0.12, 0.02);
  // ~1.7× smaller than the V434 band (0.3258 × 0.1787).
  if (r.roi!.width * r.roi!.height >= 0.3258 * 0.1787 * 0.75) {
    throw new Error("band not tightened");
  }
});

Deno.test("V471 — a real landmark wins over the ratio fallback", () => {
  const r = resolveV471MouthRoi({ ...P1, mouthSource: "landmark" });
  assertEquals(r.anchorSource, "landmark");
  assertAlmostEquals(r.roi!.centerY, 0.5 + 8 / 188, 1e-9);
});

Deno.test("V471 — horizontal pose shift from the signed offset is preserved", () => {
  const r = resolveV471MouthRoi({ ...P1, mouthOffset: { dx: -12, dy: 8 } });
  assertEquals(r.anchorSource, "face_ratio");
  assertAlmostEquals(r.roi!.centerX, 0.5 - 12 / 188, 1e-9);
});

Deno.test("V471 — unresolvable geometry never guesses", () => {
  for (
    const bad of [
      { ...P1, crop: { x: 206, y: 188, size: 0 } },
      { ...P1, faceShareInCrop: 0 },
      { ...P1, faceBbox: null },
      { ...P1, faceBbox: [10, 10, 11, 11] },
      { ...P1, crop: { x: null, y: null, size: 188 } },
    ]
  ) {
    const r = resolveV471MouthRoi(bad as never);
    assertEquals(r.roi, null);
    assertEquals(r.anchorSource, "unresolved");
  }
  assertEquals(resolveV471MouthRoi(null).anchorSource, "unresolved");
});

Deno.test("V477 — exactly one mouth ratio exists in the pipeline", () => {
  assertEquals(V471_FACE_MOUTH_Y_RATIO, 0.78);
  // Geometry side and verdict side must never diverge again.
  assertEquals(V471_FACE_MOUTH_Y_RATIO, FACE_MOUTH_Y_RATIO);
});


Deno.test("V456 contract adopts the V471 ROI as the authority", () => {
  const base = {
    anchor: "mouth",
    faceShareInCrop: P1.faceShareInCrop,
    cropSize: P1.crop.size,
    mouthOffsetPx: 8,
    mouthOffset: P1.mouthOffset,
    geometryMeasureSrc: "https://cdn.example.com/anchors/scene-a.png",
    expectedAnchorSrc: "https://cdn.example.com/anchors/scene-a.png",
    faceBbox: P1.faceBbox,
  };
  const withV471 = evaluateMouthRoiContract({
    ...base,
    crop: P1.crop,
    mouthSource: P1.mouthSource,
  });
  assertEquals(withV471.status, "authoritative");
  assertEquals(withV471.v471?.anchorSource, "face_ratio");
  assertAlmostEquals(
    withV471.roi!.centerY,
    (195 + V471_FACE_MOUTH_Y_RATIO * (317 - 195) - 188) / 188,
    1e-6,
  );


  // Legacy callers (no V471 inputs) keep the frozen V434 behaviour.
  const legacy = evaluateMouthRoiContract({ ...base, faceBbox: base.faceBbox });
  assertEquals(legacy.status, "authoritative");
  assertEquals(legacy.v471 ?? null, null);
  assertAlmostEquals(legacy.roi!.centerY, 0.5426, 0.01);
});

Deno.test("V456 — V471 requested but unresolvable → mouth_roi_unresolved, not a NOOP", () => {
  const c = evaluateMouthRoiContract({
    anchor: "mouth",
    faceShareInCrop: P1.faceShareInCrop,
    cropSize: P1.crop.size,
    mouthOffsetPx: 8,
    mouthOffset: P1.mouthOffset,
    geometryMeasureSrc: "https://cdn.example.com/anchors/scene-a.png",
    expectedAnchorSrc: "https://cdn.example.com/anchors/scene-a.png",
    faceBbox: [10, 10, 11, 11],
    crop: P1.crop,
    mouthSource: "pose_estimate",
  });
  assertEquals(c.status, "unresolved");
  assertEquals(c.roi, null);
  if (!c.reason.startsWith("mouth_roi_unresolved")) throw new Error(c.reason);
});
