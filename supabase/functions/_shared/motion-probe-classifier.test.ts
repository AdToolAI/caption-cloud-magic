/**
 * Deno tests for motion-probe-classifier.ts
 * Run: deno test supabase/functions/_shared/motion-probe-classifier.test.ts
 */
import { assertAlmostEquals, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  classifyMotionProbe,
  getS11FrozenFixture,
  MOTION_THRESHOLD,
  NOOP_THRESHOLD,
  type MotionProbeInput,
} from "./motion-probe-classifier.ts";

Deno.test("A. Frozen S11 fixture — all six cases classify as expected", () => {
  const fixture = getS11FrozenFixture();
  for (const row of fixture) {
    const result = classifyMotionProbe({
      preclip: row.preclip,
      provider: row.provider,
    });
    assertEquals(
      result.verdict,
      row.expected,
      `${row.turn}: expected ${row.expected}, got ${result.verdict} (${result.reason})`,
    );
  }
});

Deno.test("A. deltaMean just above MOTION_THRESHOLD is motion", () => {
  const input: MotionProbeInput = {
    preclip: { mean: 100, peak: 500 },
    provider: { mean: 100 + MOTION_THRESHOLD + 0.01, peak: 500 },
  };
  const r = classifyMotionProbe(input);
  assertEquals(r.verdict, "motion", r.reason);
});

Deno.test("A. deltaMean exactly at NOOP_THRESHOLD is noop (fail-closed boundary)", () => {
  const input: MotionProbeInput = {
    preclip: { mean: 100, peak: 500 },
    provider: { mean: 100 + NOOP_THRESHOLD, peak: 500 },
  };
  const r = classifyMotionProbe(input);
  assertEquals(r.verdict, "noop", r.reason);
});

Deno.test("A. Indeterminate band — deltaMean inside the gap is indeterminate", () => {
  const mid = (MOTION_THRESHOLD + NOOP_THRESHOLD) / 2;
  const input: MotionProbeInput = {
    preclip: { mean: 100, peak: 500 },
    provider: { mean: 100 + mid, peak: 500 },
  };
  const r = classifyMotionProbe(input);
  assertEquals(r.verdict, "indeterminate", r.reason);
});

Deno.test("A. Invalid metrics (NaN/negative) are indeterminate", () => {
  const r1 = classifyMotionProbe({
    preclip: { mean: NaN, peak: 0.8 },
    provider: { mean: 0.3, peak: 0.9 },
  });
  assertEquals(r1.verdict, "indeterminate");
  const r2 = classifyMotionProbe({
    preclip: { mean: 0.3, peak: -0.1 },
    provider: { mean: 0.3, peak: 0.9 },
  });
  assertEquals(r2.verdict, "indeterminate");
});

Deno.test("A. deltaPeak has no authority — large positive peak with noop mean stays noop", () => {
  const input: MotionProbeInput = {
    preclip: { mean: 100, peak: 100 },
    provider: { mean: 100, peak: 100_000 },
  };
  const r = classifyMotionProbe(input);
  assertEquals(r.verdict, "noop", r.reason);
  assertAlmostEquals(r.deltaMean, 0, 1e-10);
});

Deno.test("A. deltaPeak has no authority — negative peak with motion mean stays motion", () => {
  const input: MotionProbeInput = {
    preclip: { mean: 100, peak: 20_000 },
    provider: { mean: 200, peak: 10 },
  };
  const r = classifyMotionProbe(input);
  assertEquals(r.verdict, "motion", r.reason);
  assertAlmostEquals(r.deltaMean, 100, 1e-10);
});

