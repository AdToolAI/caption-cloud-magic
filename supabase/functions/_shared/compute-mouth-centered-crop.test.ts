/**
 * Deno sanity tests for the mouth-centered crop util (mirror of Node
 * unit tests in src/lib/composer/__tests__).
 */
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computeMouthCenteredCrop } from "./compute-mouth-centered-crop.ts";

Deno.test("centers on mouth when present", () => {
  const r = computeMouthCenteredCrop({
    face: { bbox: [500, 200, 700, 500], center: [600, 350], mouth: [600, 440] },
    plateWidth: 1284,
    plateHeight: 718,
  });
  assertEquals(r.anchor, "mouth");
  const cy = r.crop.y + r.crop.size / 2;
  assert(Math.abs(cy - 440) <= 1, `mouth-y should be crop center, got offset ${Math.abs(cy - 440)}`);
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
