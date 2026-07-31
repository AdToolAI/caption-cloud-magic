import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { capCropToFaceShare, collectSiblingFaceCenters, faceShareForCrop } from "./preclip-geometry.ts";

Deno.test("v335: legacy bbox receives a real face share instead of zero", () => {
  const share = faceShareForCrop([100, 50, 155, 125], 394);
  assert(share !== null && share > 0);
});

Deno.test("v335: legacy crop is capped above the multi-speaker floor", () => {
  const result = capCropToFaceShare({
    crop: { x: 54, y: 0, size: 394, outputSize: 720 },
    bbox: [100, 50, 155, 125],
    floor: 0.24,
    plateWidth: 1284,
    plateHeight: 718,
  });
  assert(result.capped);
  assert(result.faceShare !== null && result.faceShare >= 0.24, `share=${result.faceShare}`);
  assert(result.crop.size < 394);
});

Deno.test("v335: four plate boxes produce three sibling centers", () => {
  const boxes = [
    [10, 10, 60, 70], [110, 10, 160, 70], [210, 10, 260, 70], [310, 10, 360, 70],
  ] as Array<[number, number, number, number]>;
  const siblings = collectSiblingFaceCenters(0, boxes, []);
  assertEquals(siblings, [[135, 40], [235, 40], [335, 40]]);
});