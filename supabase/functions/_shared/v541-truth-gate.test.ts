import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildV541ReviewDetails,
  classifyPassTruth,
  V541_NEEDS_REVIEW_STATE,
  V541_NEEDS_REVIEW_VERDICT,
} from "./v541-truth-gate.ts";

Deno.test("V541 — bewiesene Bewegung bleibt verified", () => {
  const r = classifyPassTruth({ motionUnverifiedPassthrough: false });
  assertEquals(r.state, "verified");
  assertEquals(r.needsReview, false);
  assertEquals(r.reason, null);
});

Deno.test("V541 — unbewiesener Durchlauf wird needs_review", () => {
  const r = classifyPassTruth({
    motionUnverifiedPassthrough: true,
    reason: "v500_noop_unverified_anchor",
  });
  assertEquals(r.state, V541_NEEDS_REVIEW_STATE);
  assertEquals(r.needsReview, true);
  assertEquals(r.reason, "v500_noop_unverified_anchor");
});

Deno.test("V541 — fehlender Grund fällt auf motion_unverified zurück", () => {
  assertEquals(
    classifyPassTruth({ motionUnverifiedPassthrough: true }).reason,
    "motion_unverified",
  );
});

Deno.test("V541 — Telemetrie ist sanitisiert und zählt nie als Erfolg", () => {
  const d = buildV541ReviewDetails({
    passIdx: 2,
    totalPasses: 6,
    reason: "x".repeat(500),
    source: "webhook",
  });
  assertEquals(d.counts_as_success, false);
  assertEquals(d.truth_state, V541_NEEDS_REVIEW_STATE);
  assertEquals(d.pass_idx, 2);
  assertEquals(d.total_passes, 6);
  assertEquals(String(d.reason).length, 200);
  assertEquals(V541_NEEDS_REVIEW_VERDICT, "v541_needs_review");
});

Deno.test("V541 — nicht-numerische Indizes werden zu null", () => {
  const d = buildV541ReviewDetails({
    passIdx: NaN,
    totalPasses: null,
    reason: null,
    source: "watchdog",
  });
  assertEquals(d.pass_idx, null);
  assertEquals(d.total_passes, null);
  assertEquals(d.reason, null);
  assertEquals(d.source, "watchdog");
});
