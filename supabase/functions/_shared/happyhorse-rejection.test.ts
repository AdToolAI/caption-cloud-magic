import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  classifyProviderRejection,
  isGreenNetRejection,
  hardSanitizeForHappyHorse,
} from "./happyhorse-green-net.ts";

const REAL_INVALID_PARAM =
  "Prediction failed: Async prediction failed: Exception: Happy Horse I2V failed: InvalidParameter - Could not process with this prompt.";
const REAL_GREEN_NET =
  "DataInspectionFailed - Green net check failed for text (input)";

Deno.test("v369: InvalidParameter is classified as prompt rejection", () => {
  assertEquals(classifyProviderRejection(REAL_INVALID_PARAM), "invalid_prompt");
  assertEquals(isGreenNetRejection(REAL_INVALID_PARAM), true);
});

Deno.test("v369: Green Net stays classified as greennet", () => {
  assertEquals(classifyProviderRejection(REAL_GREEN_NET), "greennet");
  assertEquals(isGreenNetRejection(REAL_GREEN_NET), true);
});

Deno.test("v369: transient infrastructure errors are not rejections", () => {
  for (
    const e of [
      "HTTPSConnectionPool: Read timed out",
      "502 Bad Gateway",
      "model_failed_silently",
      "",
      null,
    ]
  ) {
    assertEquals(classifyProviderRejection(e), "none", String(e));
  }
});

Deno.test("v369: hard sanitizer actually changes a rejected dialog plate prompt", () => {
  const plate =
    "[3 SHOT] Four speakers, Sarah Dusatko, Matthew Dusatko, Samuel Dusatko, and Kailee, are in a dark bedroom at 3 AM lit only by the blue glow of a laptop screen. " +
    "Sarah Dusatko is speaking, while the others are visible and attentive. " +
    "Extreme close-up on a woman's face, her lips and jaw forming syllables, teeth and tongue visible while whispering. " +
    "[8 NEGATIVE] No lip-flap, no chewing pattern, no whispering shapes, no camera cut.";
  const res = hardSanitizeForHappyHorse(plate);
  assertEquals(res.emptied, false);
  assertEquals(res.clean.trim() === plate.trim(), false);
  assertEquals(res.clean.toLowerCase().includes("bedroom"), false);
  assertEquals(res.touched.length > 0, true);
});
