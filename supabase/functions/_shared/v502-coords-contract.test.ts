import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  distanceOutsideCrop,
  isValidCrop,
  projectPlatePointToClip,
  resolveCoordsContract,
} from "./v502-coords-contract.ts";

const CROP = { x: 203, y: 157, size: 187, outputSize: 720 };

Deno.test("V502 — S01 Pass 0 legacy coords are proven outside their own crop", () => {
  const c = resolveCoordsContract({ crop: CROP, legacyCoords: [177, 272] });
  assertEquals(c.legacyInsideCrop, false);
  assertEquals(c.legacyOutsidePx, 26);
  assertEquals(c.reason, "legacy_out_of_crop");
});

Deno.test("V502 — S01 Pass 1 legacy coords are consistent with their crop", () => {
  const c = resolveCoordsContract({
    crop: { x: 217, y: 157, size: 187, outputSize: 720 },
    legacyCoords: [266, 225],
  });
  assertEquals(c.legacyInsideCrop, true);
  assertEquals(c.legacyOutsidePx, 0);
});

Deno.test("V502 — anchor falls back to the crop center without a mouth offset", () => {
  const c = resolveCoordsContract({ crop: CROP, legacyCoords: [177, 272] });
  assertEquals(c.anchorPlate, [297, 251]);
  assertEquals(c.source, "crop_center");
  assertEquals(c.anchorClip, [362, 362]);
});

Deno.test("V502 — a signed mouth offset carries the anchor", () => {
  const c = resolveCoordsContract({
    crop: CROP,
    legacyCoords: [177, 272],
    mouthOffsetXy: { dx: -10, dy: 18 },
  });
  assertEquals(c.source, "mouth_offset");
  assertEquals(c.anchorPlate, [287, 269]);
  assertEquals(c.anchorClip, projectPlatePointToClip([287, 269], CROP));
});

Deno.test("V502 — an out-of-crop mouth offset degrades to the crop center", () => {
  const c = resolveCoordsContract({
    crop: CROP,
    mouthOffsetXy: { dx: -400, dy: 0 },
  });
  assertEquals(c.source, "crop_center");
  assertEquals(c.anchorPlate, [297, 251]);
});

Deno.test("V502 — projection never clamps an out-of-crop point", () => {
  assertEquals(projectPlatePointToClip([177, 272], CROP), null);
});

Deno.test("V502 — projection maps the crop origin and center exactly", () => {
  assertEquals(projectPlatePointToClip([203, 157], CROP), [1, 1]);
  assertEquals(projectPlatePointToClip([297, 251], CROP), [362, 362]);
});

Deno.test("V502 — invalid crops yield no contract", () => {
  assertEquals(isValidCrop({ x: 1, y: 2, size: 0 }), false);
  const c = resolveCoordsContract({ crop: null, legacyCoords: [10, 10] });
  assertEquals(c.source, "none");
  assertEquals(c.anchorClip, null);
});

Deno.test("V502 — distance is zero inside and euclidean outside", () => {
  assertEquals(distanceOutsideCrop([250, 200], CROP), 0);
  assertEquals(distanceOutsideCrop([200, 154], CROP), 4);
});
