import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { validateReprojectionPasses } from "../_shared/preclip-reprojection-contract.ts";

Deno.test("v368 four-speaker mux preserves distinct plate targets", () => {
  const result = validateReprojectionPasses([
    { speaker_idx: 0, character_id: "samuel", preclip_crop: { x: 1004, y: 362.6, size: 213, outputSize: 720 } },
    { speaker_idx: 1, character_id: "matthew", preclip_crop: { x: 488, y: 178.2, size: 133, outputSize: 720 } },
    { speaker_idx: 2, character_id: "sarah", preclip_crop: { x: 1324, y: 255.2, size: 364, outputSize: 720 } },
    { speaker_idx: 3, character_id: "kailee", preclip_crop: { x: 695, y: 215, size: 128, outputSize: 720 } },
  ], 1928, 1076);

  assertEquals(result.ok, true);
  assertEquals(result.passes.map((pass) => pass.crop.size), [213, 133, 364, 128]);
});

Deno.test("v368 mux blocks two speakers targeting one face", () => {
  const result = validateReprojectionPasses([
    { speaker_idx: 0, character_id: "a", preclip_crop: { x: 400, y: 200, size: 180, outputSize: 720 } },
    { speaker_idx: 1, character_id: "b", preclip_crop: { x: 410, y: 210, size: 180, outputSize: 720 } },
  ], 1920, 1080);

  assertEquals(result.ok, false);
  assertEquals(result.errors.includes("target_collision:0:1"), true);
});