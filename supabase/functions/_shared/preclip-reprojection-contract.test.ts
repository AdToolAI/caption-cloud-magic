import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  parseReprojectionPass,
  validateReprojectionPasses,
} from "./preclip-reprojection-contract.ts";

Deno.test("v368 keeps plate crop independent from 720px provider space", () => {
  const parsed = parseReprojectionPass({
    speaker_idx: 0,
    character_id: "samuel",
    preclip_crop: { x: 1004, y: 362.6, size: 213, outputSize: 720 },
  });
  assertEquals(parsed?.crop, { x: 1004, y: 362.6, size: 213, outputSize: 720 });
});

Deno.test("v368 accepts four distinct native-plate targets", () => {
  const result = validateReprojectionPasses([
    { speaker_idx: 0, character_id: "samuel", preclip_crop: { x: 1004, y: 362.6, size: 213, outputSize: 720 } },
    { speaker_idx: 1, character_id: "matthew", preclip_crop: { x: 488, y: 178.2, size: 133, outputSize: 720 } },
    { speaker_idx: 2, character_id: "sarah", preclip_crop: { x: 1324, y: 255.2, size: 364, outputSize: 720 } },
    { speaker_idx: 3, character_id: "kailee", preclip_crop: { x: 695, y: 215, size: 128, outputSize: 720 } },
  ], 1928, 1076);
  assertEquals(result.ok, true);
  assertEquals(result.errors, []);
});

Deno.test("v368 rejects duplicate identities and collapsed crop targets", () => {
  const result = validateReprojectionPasses([
    { speaker_idx: 0, character_id: "sarah", preclip_crop: { x: 100, y: 100, size: 200, outputSize: 720 } },
    { speaker_idx: 1, character_id: "sarah", preclip_crop: { x: 110, y: 105, size: 190, outputSize: 720 } },
  ], 1920, 1080);
  assertEquals(result.ok, false);
  assertEquals(result.errors.includes("duplicate_character:sarah"), true);
  assertEquals(result.errors.includes("target_collision:0:1"), true);
});