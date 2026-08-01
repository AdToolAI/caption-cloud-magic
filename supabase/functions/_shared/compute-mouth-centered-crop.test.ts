/**
 * Deno sanity tests for the mouth-centered crop util (mirror of Node
 * unit tests in src/lib/composer/__tests__).
 */
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computeMouthCenteredCrop } from "./compute-mouth-centered-crop.ts";

Deno.test("v360: mouth stays in the lower half and the whole head fits", () => {
  const r = computeMouthCenteredCrop({
    face: { bbox: [500, 200, 700, 500], center: [600, 350], mouth: [600, 440] },
    plateWidth: 1284,
    plateHeight: 718,
  });
  assertEquals(r.anchor, "mouth");
  const cy = r.crop.y + r.crop.size / 2;
  assert(cy < 440, `mouth must sit below the crop center, got center ${cy}`);
  assert(r.headContained, "the full head must fit inside the crop");
  assert(r.crop.y <= 200, `crop must not cut the forehead, y=${r.crop.y}`);
});

Deno.test("v360: an anchor below the chin is repaired (Matthew-Fall)", () => {
  // Belegte Werte aus Szene 89c5e01c, Pass 1: Anker 18 px unter dem Kinn.
  const r = computeMouthCenteredCrop({
    face: { bbox: [561, 176, 633, 275], center: [562, 293] },
    plateWidth: 1928,
    plateHeight: 1076,
    minSize: 128,
  });
  assert(r.anchorRepaired, "the out-of-face anchor must be flagged as repaired");
  assert(r.headContained, "the repaired crop must contain the whole head");
  assert(r.crop.y <= 176, `forehead must not be cut, y=${r.crop.y}`);
  assert(
    r.crop.y + r.crop.size >= 275,
    `chin must not be cut, bottom=${r.crop.y + r.crop.size}`,
  );
});


Deno.test("v247 regression: small face reaches ≥35% face share", () => {
  const r = computeMouthCenteredCrop({
    face: {
      bbox: [980, 300, 1084, 408],
      center: [1032, 354],
      mouth: [1032, 388],
    },
    plateWidth: 1284,
    plateHeight: 718,
  });
  assert(
    r.faceShareInCrop >= 0.35,
    `expected faceShareInCrop ≥ 0.35, got ${r.faceShareInCrop}`,
  );
});

Deno.test("v344.1: 41x55px face in a minSize-widened crop passes the linear floor", () => {
  const r = computeMouthCenteredCrop({
    face: { bbox: [820, 300, 861, 355], center: [840, 327], mouth: [840, 340] },
    plateWidth: 1284,
    plateHeight: 718,
    minSize: 96,
  });
  assert(r.minSizeWidened, "minSize should be what sized this crop");
  assert(
    r.faceSideShare >= 0.34,
    `expected faceSideShare ≥ 0.34, got ${r.faceSideShare} (crop=${r.crop.size})`,
  );
  assert(r.faceSidePx === 55, `expected faceSidePx 55, got ${r.faceSidePx}`);
});
