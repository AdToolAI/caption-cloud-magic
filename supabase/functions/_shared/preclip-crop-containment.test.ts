import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { evaluatePreclipCropContainment } from "./preclip-crop-containment.ts";

const crop = { x: 700, y: 120, size: 240, outputSize: 720 };
const target: [number, number, number, number] = [753, 187, 819, 277];

Deno.test("contained target with no foreign center passes and yields the wire box", () => {
  const r = evaluatePreclipCropContainment({
    crop,
    targetBbox: target,
    otherSpeakerCenters: [[256, 285], [508, 251], [1064, 252]],
  });
  assertEquals(r.ok, true);
  assertEquals(r.clipBox, [159, 201, 357, 471]);
});

Deno.test("target partly outside the crop fails closed", () => {
  const r = evaluatePreclipCropContainment({
    crop: { x: 780, y: 120, size: 240, outputSize: 720 },
    targetBbox: target,
    otherSpeakerCenters: [],
  });
  assertEquals(r.ok, false);
  assertEquals(r.reason, "target_not_contained_in_crop");
});

Deno.test("another assigned speaker center inside the transformed target fails closed", () => {
  const r = evaluatePreclipCropContainment({
    crop,
    targetBbox: target,
    otherSpeakerCenters: [[786, 232]],
  });
  assertEquals(r.ok, false);
  assertEquals(r.reason, "other_speaker_center_in_target");
});

Deno.test("degenerate target and invalid crop fail closed", () => {
  assertEquals(
    evaluatePreclipCropContainment({ crop, targetBbox: [10, 10, 10, 10], otherSpeakerCenters: [] }).reason,
    "invalid_target_bbox",
  );
  assertEquals(
    evaluatePreclipCropContainment({
      crop: { x: 0, y: 0, size: 0, outputSize: 720 },
      targetBbox: target,
      otherSpeakerCenters: [],
    }).reason,
    "invalid_crop",
  );
});
