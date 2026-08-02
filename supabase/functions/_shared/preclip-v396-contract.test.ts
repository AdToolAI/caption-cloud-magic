/**
 * v396 — Regressionstests für den Preclip-Autoritätsvertrag.
 *
 * Deckt die im Plan benannten Fälle ab:
 *   - frame_number 102 gegen 68-Frame-Preclip → frame_mapping_failed
 *   - Roundtrip besteht auch bei falscher, konsistent invertierter Matrix;
 *     der Conformance-Test fängt sie
 *   - Anchor-Drift +57/+33 px → source_geometry_drift statt Dispatch
 *   - einziges Gesicht mit zu kleiner Margin → identity_ambiguous
 *   - Nachbargesicht → wrong_identity
 *   - Recrop verschiebt minimal und hält die Face-Bbox
 *   - boxes.length gegen ffprobe-Framezahl
 */

import { assertEquals, assertAlmostEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { checkPreclipFrame, preclipFrame, toPreclipFrame, plateFrame } from "./frame-space.ts";
import {
  assertRoundtrip,
  buildPreclipTransform,
  checkRendererConformance,
  plateToPreclip,
  preclipToPlate,
  type AffineMatrix,
  type PreclipTransform,
} from "./preclip-transform.ts";
import { bindPreclipIdentity } from "./preclip-identity-binding.ts";
import { measureGeometryDrift, recropToSafeRegion, stableAnchor } from "./preclip-safe-region.ts";
import { assertProviderBoxContract, buildProviderBoxes } from "./preclip-provider-boxes.ts";
import { evaluatePreclipGeometry } from "./preclip-geometry-contract.ts";

// ── 1) Frame-Falle ───────────────────────────────────────────────────
Deno.test("v396 frame trap: plate frame 102 against a 68-frame preclip is rejected", () => {
  const r = checkPreclipFrame(102, 68);
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.code, "frame_mapping_failed");
});

Deno.test("v396 frame trap: valid local index passes and maps back", () => {
  const f = preclipFrame(37, 68);
  assertEquals(Number(f), 37);
  const mapped = toPreclipFrame(plateFrame(139), plateFrame(102), 68);
  assertEquals(Number(mapped), 37);
});

// ── 2) Geometrievertrag ──────────────────────────────────────────────
Deno.test("v396 roundtrip holds for a correct transform", () => {
  const t = buildPreclipTransform({ x: 800, y: 200, size: 480, outputSize: 720 });
  const r = assertRoundtrip(t, [[1110.5, 437], [800, 200], [1280, 680]]);
  assert(r.ok, `roundtrip failed with ${r.maxErrorPx}`);
  assertAlmostEquals(plateToPreclip(t, [800, 200])[0], 0, 1e-9);
  assertAlmostEquals(preclipToPlate(t, [720, 720])[1], 680, 1e-9);
});

Deno.test("v396 roundtrip is necessary but NOT sufficient — conformance catches the wrong matrix", () => {
  const good = buildPreclipTransform({ x: 800, y: 200, size: 480, outputSize: 720 });
  // Falsche Matrix, aber sauber invertiert: der Roundtrip besteht.
  const forward: AffineMatrix = [1.5, 0, -1260, 0, 1.5, -360];
  const inverse: AffineMatrix = [1 / 1.5, 0, 840, 0, 1 / 1.5, 240];
  const bogus: PreclipTransform = { forward, inverse, crop: good.crop, scaleX: 1.5, scaleY: 1.5 };
  assert(assertRoundtrip(bogus, [[1110.5, 437], [900, 300]]).ok);

  // Der Renderer hat aber tatsächlich nach `good` rasterisiert.
  const markers = [[820, 220], [1200, 300], [900, 640], [1250, 660]].map((p) => ({
    plate: p as [number, number],
    measuredPreclip: plateToPreclip(good, p as [number, number]),
  }));
  assert(checkRendererConformance(good, markers).ok);
  const bad = checkRendererConformance(bogus, markers);
  assertEquals(bad.ok, false);
  assert(bad.maxErrorPx > 1.5);
});

// ── 3) Identität ─────────────────────────────────────────────────────
const REF = "anchor-asset-1";

Deno.test("v396 identity: single detected face with a thin margin is ambiguous, not ok", () => {
  const r = bindPreclipIdentity({
    expectedCharacterId: "sarah",
    referenceAssetId: REF,
    candidates: [
      { faceIndex: 0, score: 0.71, characterId: "sarah", bbox: [0, 0, 10, 10], center: [5, 5] },
      { faceIndex: 1, score: 0.69, characterId: "kailee", bbox: [0, 0, 10, 10], center: [5, 5] },
    ],
  });
  assertEquals(r.ok, false);
  assertEquals(r.code, "identity_ambiguous");
  assertAlmostEquals(r.identity_margin ?? 0, 0.02, 1e-9);
});

Deno.test("v396 identity: neighbour face is wrong_identity", () => {
  const r = bindPreclipIdentity({
    expectedCharacterId: "sarah",
    referenceAssetId: REF,
    candidates: [{ faceIndex: 0, score: 0.93, characterId: "samuel", bbox: [0, 0, 10, 10], center: [5, 5] }],
  });
  assertEquals(r.code, "wrong_identity");
  assertEquals(r.matched_character_uuid, "samuel");
});

Deno.test("v396 identity: no face is face_not_detected, missing reference is its own code", () => {
  assertEquals(
    bindPreclipIdentity({ expectedCharacterId: "s", referenceAssetId: REF, candidates: [] }).code,
    "face_not_detected",
  );
  assertEquals(
    bindPreclipIdentity({ expectedCharacterId: "s", referenceAssetId: null, candidates: [] }).code,
    "identity_reference_missing",
  );
});

// ── 4) Drift über stabile Merkmale ───────────────────────────────────
Deno.test("v396 drift is measured on stable features and tolerates mouth motion", () => {
  const anchor = stableAnchor({
    bboxCenter: [100, 100],
    leftEye: [80, 80],
    rightEye: [120, 80],
    nose: [100, 100],
  });
  assertAlmostEquals(anchor[0], 100, 1e-9);

  const d = measureGeometryDrift([
    { preclipFrame: 0, projected: [360, 479], observed: [417, 512] },
    { preclipFrame: 8, projected: [360, 479], observed: [418, 511] },
    { preclipFrame: 16, projected: [360, 479], observed: [416, 513] },
  ]);
  assert(d.consistent);
  assertAlmostEquals(d.vector[0], 57, 1.01);
  assertAlmostEquals(d.vector[1], 33, 1.01);
});

Deno.test("v396 drift: a jittering error vector is flagged as not constant", () => {
  const d = measureGeometryDrift([
    { preclipFrame: 0, projected: [0, 0], observed: [60, 0] },
    { preclipFrame: 5, projected: [0, 0], observed: [-40, 30] },
    { preclipFrame: 9, projected: [0, 0], observed: [10, -50] },
  ]);
  assertEquals(d.consistent, false);
});

// ── 5) Minimaler Recrop ──────────────────────────────────────────────
Deno.test("v396 recrop shifts minimally and keeps the face box fully contained", () => {
  const crop = { x: 900, y: 300, size: 480, outputSize: 720 };
  const r = recropToSafeRegion({
    crop,
    plateWidth: 1928,
    plateHeight: 1076,
    faceBoxPlate: [1100, 380, 1250, 560],
    // Mund liegt zu dicht am unteren Crop-Rand.
    mouthRectPlate: [1150, 745, 1210, 785],
  });
  assert(r.ok, r.reason);
  assertEquals(r.code, "recropped");
  assert(r.crop.y > crop.y, "crop must move down to capture the mouth");
  assert(r.crop.y <= 1076 - r.crop.size);
  // Face-Box bleibt vollständig enthalten.
  assert(r.crop.x <= 1100 && r.crop.x + r.crop.size >= 1250);
  assert(r.crop.y <= 380 && r.crop.y + r.crop.size >= 560);
});

Deno.test("v396 recrop: viable crop is left untouched", () => {
  const crop = { x: 1000, y: 350, size: 480, outputSize: 720 };
  const r = recropToSafeRegion({
    crop,
    plateWidth: 1928,
    plateHeight: 1076,
    faceBoxPlate: [1100, 400, 1250, 580],
    mouthRectPlate: [1150, 540, 1210, 580],
  });
  assertEquals(r.code, "already_viable");
  assertEquals(r.crop.x, crop.x);
});

// ── 6) Provider-Boxen ────────────────────────────────────────────────
Deno.test("v396 provider boxes: one smoothed entry per decoded frame", () => {
  const r = buildProviderBoxes({
    observations: [
      { preclipFrame: 0, box: [200, 200, 400, 440] },
      { preclipFrame: 10, box: [210, 205, 412, 447] },
      { preclipFrame: 20, box: [230, 210, 430, 450] },
    ],
    decodedFrameCount: 21,
    clipWidth: 720,
    clipHeight: 720,
  });
  assert(r.ok, r.reason);
  assertEquals(r.boxes.length, 21);
  assertEquals(assertProviderBoxContract(r.boxes, 21).ok, true);
  // Gegen die geplante Remotion-Framezahl statt ffprobe → Vertragsbruch.
  assertEquals(assertProviderBoxContract(r.boxes, 24).ok, false);
});

Deno.test("v396 provider boxes: refuses to guess without observations", () => {
  const r = buildProviderBoxes({ observations: [], decodedFrameCount: 30, clipWidth: 720, clipHeight: 720 });
  assertEquals(r.ok, false);
});

// ── 7) Gesamtvertrag ─────────────────────────────────────────────────
const CROP = { x: 850, y: 220, size: 480, outputSize: 720 };

function observation(preclipFrame: number, center: [number, number], mouthDy = 60) {
  const half = 110;
  return {
    preclipFrame,
    faces: [
      {
        bbox: [center[0] - half, center[1] - half, center[0] + half, center[1] + half] as const,
        center,
        features: {
          bboxCenter: center,
          leftEye: [center[0] - 40, center[1] - 30] as const,
          rightEye: [center[0] + 40, center[1] - 30] as const,
          nose: center,
        },
        mouth: [center[0], center[1] + mouthDy] as const,
      },
    ],
    candidates: [
      { faceIndex: 0, score: 0.94, characterId: "sarah", bbox: [0, 0, 1, 1] as const, center },
    ],
  };
}

Deno.test("v396 contract: documented 9eded574 drift is measured, never silently trusted", () => {
  // Geplant [1110.5, 437] auf der Plate; real +56.5/+33 daneben. Der Drift
  // wird gemessen und persistiert. Solange die GEMESSENE Preclip-Geometrie
  // trägt, ist der Dispatch erlaubt — der Provider-Payload stammt ab v396
  // aus der Messung, nicht mehr aus der veralteten Projektion.
  const scale = CROP.outputSize / CROP.size;
  const observed: [number, number] = [(1167 - CROP.x) * scale, (470 - CROP.y) * scale];
  const r = evaluatePreclipGeometry({
    crop: CROP,
    plateWidth: 1928,
    plateHeight: 1076,
    decodedFrameCount: 68,
    preclipStartPlateFrame: 102,
    fps: 30,
    plannedFaceCenterPlate: [1110.5, 437],
    expectedCharacterId: "sarah",
    referenceAssetId: REF,
    observations: [observation(0, observed), observation(20, observed), observation(40, observed)],
  });
  assert(r.drift !== null && r.drift.magnitudePx > 40, "drift must be measured on stable features");
  assert(r.drift!.consistent, "a constant offset must be reported as consistent");
  assertEquals(r.transform.geometry_fingerprint, "v396:850:220:480:720");
  assertEquals((r.forensics as any).planned_face_center_plate[0], 1110.5);
});

Deno.test("v396 contract: drift that pushes the mouth out of the safe region requires a recrop", () => {
  // Gesicht sitzt real unten rechts im Crop; der Mund verlässt die
  // Safe-Region. Genau der Fall, der bisher als `mouth_at_edge` terminal war.
  const observed: [number, number] = [615, 630];
  const r = evaluatePreclipGeometry({
    crop: CROP,
    plateWidth: 1928,
    plateHeight: 1076,
    decodedFrameCount: 68,
    preclipStartPlateFrame: 102,
    fps: 30,
    plannedFaceCenterPlate: [1110.5, 437],
    expectedCharacterId: "sarah",
    referenceAssetId: REF,
    observations: [observation(0, observed), observation(20, observed), observation(40, observed)],
  });
  assertEquals(r.ok, false);
  assert(
    r.code === "recrop_required" || r.code === "crop_not_viable",
    `unexpected verdict ${r.code}`,
  );
  if (r.code === "recrop_required") {
    assert(r.suggestedCrop, "a recrop verdict must carry exactly one corrected crop");
  }
});


Deno.test("v396 contract: out-of-range preclip frame fails before any provider work", () => {
  const r = evaluatePreclipGeometry({
    crop: CROP,
    plateWidth: 1928,
    plateHeight: 1076,
    decodedFrameCount: 68,
    preclipStartPlateFrame: 0,
    fps: 30,
    plannedFaceCenterPlate: [1110.5, 437],
    expectedCharacterId: "sarah",
    referenceAssetId: REF,
    observations: [observation(102, [360, 360])],
  });
  assertEquals(r.code, "frame_mapping_failed");
  assertEquals(r.identity, null);
});

Deno.test("v396 contract: a well-placed face passes cleanly", () => {
  const center: [number, number] = [360, 330];
  const platePlanned: [number, number] = [
    CROP.x + center[0] * (CROP.size / CROP.outputSize),
    CROP.y + center[1] * (CROP.size / CROP.outputSize),
  ];
  const r = evaluatePreclipGeometry({
    crop: CROP,
    plateWidth: 1928,
    plateHeight: 1076,
    decodedFrameCount: 68,
    preclipStartPlateFrame: 102,
    fps: 30,
    plannedFaceCenterPlate: platePlanned,
    expectedCharacterId: "sarah",
    referenceAssetId: REF,
    observations: [observation(0, center), observation(30, center), observation(60, center)],
  });
  assertEquals(r.code, "ok");
  assertEquals(r.ok, true);
  assertEquals(r.frames.length, 3);
  assertEquals(r.frames[0].source_plate_frame, 102);
  assertEquals(r.frames[2].source_plate_frame, 162);
});

Deno.test("v396 contract: a second unusable crop after a recrop is terminal", () => {
  const observed: [number, number] = [615, 630];

  const r = evaluatePreclipGeometry({
    crop: CROP,
    plateWidth: 1928,
    plateHeight: 1076,
    decodedFrameCount: 68,
    preclipStartPlateFrame: 102,
    fps: 30,
    plannedFaceCenterPlate: [1110.5, 437],
    expectedCharacterId: "sarah",
    referenceAssetId: REF,
    observations: [observation(0, observed), observation(20, observed)],
    recropAlreadyAttempted: true,
  });
  assert(r.code === "crop_not_viable" || r.code === "source_geometry_drift", `got ${r.code}`);
  assertEquals(r.ok, false);
});
