/**
 * Deno sanity tests for the mouth-centered crop util (mirror of Node
 * unit tests in src/lib/composer/__tests__).
 */
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computeMouthCenteredCrop, projectCropToContain } from "./compute-mouth-centered-crop.ts";

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

Deno.test("V457: crop wird auf den gepaddeten Dispatch-Kasten projiziert", () => {
  const target: [number, number, number, number] = [219, 149, 302, 258];
  const r = projectCropToContain({ x: 185, y: 156, size: 153 }, target, 1284, 718);
  assertEquals(r.containsTarget, true);
  assertEquals(r.shiftPx, { x: 0, y: -7 });
  assertEquals(r.sizeGrown, false);
  const again = projectCropToContain(r.crop, target, 1284, 718);
  assertEquals(again.crop, r.crop);
  assertEquals(again.reason, "already_contained");
});

Deno.test("V457: Impossible-Case wird nicht maskiert", () => {
  const r = projectCropToContain({ x: 500, y: 100, size: 200 }, [600, 100, 900, 300], 800, 400);
  assertEquals(r.containsTarget, false);
  assertEquals(r.reason, "contain_box_outside_plate");
});
