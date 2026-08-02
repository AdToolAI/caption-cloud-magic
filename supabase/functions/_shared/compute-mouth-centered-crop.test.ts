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
