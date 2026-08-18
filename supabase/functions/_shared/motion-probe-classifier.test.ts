/**
 * Deno tests for motion-probe-classifier.ts
 * Run: deno test supabase/functions/_shared/motion-probe-classifier.test.ts
 */
import { assertAlmostEquals, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { classifyMotionProbe, getS11FrozenFixture, type MotionProbeInput } from "./motion-probe-classifier.ts";

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

Deno.test("A. T2 sensitivity anchor — just above indeterminate band stays motion", () => {
  // T2 Δpeak = +0.13.  Perturb downward slightly; it must still be motion
  // as long as it stays above the motion threshold (+0.08).
  const input: MotionProbeInput = {
    preclip: { mean: 0.328, peak: 0.886 },
    provider: { mean: 0.335, peak: 0.970 }, // Δpeak = +0.084
  };
  const r = classifyMotionProbe(input);
  assertEquals(r.verdict, "motion", `T2-perturbed: ${r.reason}`);
});

Deno.test("A. Noop boundary — strongest noop p3 stays noop even with small upward perturbation", () => {
  // p3 Δpeak = -0.07.  Perturb upward to -0.03; it must still be noop
  // because it is below the noop threshold (-0.02).
  const input: MotionProbeInput = {
    preclip: { mean: 0.355, peak: 0.936 },
    provider: { mean: 0.356, peak: 0.906 }, // Δpeak = -0.03
  };
  const r = classifyMotionProbe(input);
  assertEquals(r.verdict, "noop", `p3-perturbed: ${r.reason}`);
});

Deno.test("A. Indeterminate band — delta_peak inside the gap is indeterminate", () => {
  const input: MotionProbeInput = {
    preclip: { mean: 0.3, peak: 0.8 },
    provider: { mean: 0.31, peak: 0.85 }, // Δpeak = +0.05 (inside -0.02..+0.08)
  };
  const r = classifyMotionProbe(input);
  assertEquals(r.verdict, "indeterminate", `band: ${r.reason}`);
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

Deno.test("A. Motion output must have higher peak than preclip", () => {
  const input: MotionProbeInput = {
    preclip: { mean: 1.0, peak: 2.0 },
    provider: { mean: 1.2, peak: 3.0 }, // Δpeak = +1.0
  };
  const r = classifyMotionProbe(input);
  assertEquals(r.verdict, "motion");
  assertAlmostEquals(r.deltaPeak, 1.0, 1e-10);
});

Deno.test("A. Noop output must have equal or lower peak than preclip", () => {
  const input: MotionProbeInput = {
    preclip: { mean: 0.5, peak: 1.0 },
    provider: { mean: 0.5, peak: 0.9 }, // Δpeak = -0.1
  };
  const r = classifyMotionProbe(input);
  assertEquals(r.verdict, "noop");
  assertAlmostEquals(r.deltaPeak, -0.1, 1e-10);
});
