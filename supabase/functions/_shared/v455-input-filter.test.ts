/**
 * V455 — Provider-Eingabefilter + Negations-Kompression.
 */
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  classifyProviderRejection,
  compressNegations,
  sanitizeForHappyHorse,
  PROVIDER_INPUT_FILTER_CLASS,
} from "./happyhorse-green-net.ts";

const GREEN_NET =
  "Prediction failed: Async prediction failed: Exception: Happy Horse I2V failed: DataInspectionFailed - Green net check failed for text (input): Input data may contain inappropriate content.";

Deno.test("Green-Net wird als terminaler Eingabefilter klassifiziert", () => {
  assertEquals(classifyProviderRejection(GREEN_NET), "input_filter");
  assertEquals(classifyProviderRejection("InvalidParameter - Could not process with this prompt."), "invalid_prompt");
  assertEquals(PROVIDER_INPUT_FILTER_CLASS, "provider_input_filter");
});

Deno.test("Transiente Infrastrukturfehler bleiben unverändert retrybar", () => {
  assertEquals(classifyProviderRejection("HTTPSConnectionPool: Read timed out"), "none");
  assertEquals(classifyProviderRejection("502 Bad Gateway"), "none");
  assertEquals(classifyProviderRejection(""), "none");
});

Deno.test("Providergrund überlebt die Klassifikation ohne erfundenes Triggerwort", () => {
  const tagged = `[${PROVIDER_INPUT_FILTER_CLASS}:input_filter] ` + GREEN_NET.slice(0, 480);
  assert(tagged.includes("Green net check failed for text (input)"));
  assert(!/trigger word|blocked word/i.test(tagged));
});

Deno.test("Negativlisten werden entfernt, Handlung/Setting/Topologie bleiben", () => {
  const prompt =
    "Sarah stands left and Samuel walks right on a rooftop at sunset, no cuts, no zoom, no pan, no split-screen. No lip-flap, no chewing, no muttering. No other humans, no bystanders, no rendered text.";
  const { out, touched } = compressNegations(prompt);
  assert(touched);
  assert(out.includes("Sarah stands left"));
  assert(out.includes("rooftop at sunset"));
  assert(!/\bno cuts\b|\bno chewing\b|\bno rendered text\b/i.test(out));
  assert(out.includes("one single continuous shot"));
  assert(out.includes("mouths stay calmly closed"));
});

Deno.test("Sanitizer meldet compress-negations und bleibt nicht leer", () => {
  const r = sanitizeForHappyHorse(
    "Four people talk on a rooftop, no cuts, no zoom, no grid, no rendered text.",
  );
  assert(r.touched.includes("compress-negations"));
  assert(!r.emptied);
  assert(r.clean.includes("rooftop"));
});

Deno.test("Einzelne Negation bleibt unangetastet", () => {
  const { out, touched } = compressNegations("A calm rooftop scene, no rendered text.");
  assertEquals(touched, false);
  assertEquals(out, "A calm rooftop scene, no rendered text.");
});
