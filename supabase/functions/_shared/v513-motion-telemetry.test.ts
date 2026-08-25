import {
  assert,
  assertAlmostEquals,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  computeV513MotionTelemetry,
  type V513MotionSample,
  type V513MotionTelemetry,
} from "./v513-motion-telemetry.ts";

type Box = [number, number, number, number];

type FixtureSample = {
  t: number;
  box: Box;
};

const s = (t: number, box: Box): FixtureSample => ({ t, box });

const metric = (value: number | null): number => {
  assert(typeof value === "number");
  return value;
};

const assertUnavailableMetrics = (out: V513MotionTelemetry): void => {
  assertEquals(out.median_side_px, null);
  assertEquals(out.center_x_range_norm, null);
  assertEquals(out.center_y_range_norm, null);
  assertEquals(out.center_range_norm, null);
  assertEquals(out.net_displacement_norm, null);
  assertEquals(out.path_length_norm, null);
  assertEquals(out.max_step_norm, null);
  assertEquals(out.mean_step_norm, null);
  assertEquals(out.side_range_norm, null);
  assertEquals(out.side_change_pct, null);
  assertEquals(out.heading_changes_gt_90, null);
  assertEquals(out.max_heading_change_deg, null);
  assertEquals(out.second_difference_norm_diagnostic, null);
};

// Golden A — near-static: path ≈ 0.044, net ≈ 0.042 (median face side = 100 px).
const GOLDEN_A: FixtureSample[] = [
  s(0.0, [750.0, 350, 850.0, 450]),
  s(0.25, [752.3, 350, 852.3, 450]),
  s(0.5, [752.2, 350, 852.2, 450]),
  s(0.75, [754.2, 350, 854.2, 450]),
];

// Moving B — path ≈ 1.537, net ≈ 0.623 (median face side = 100 px).
const MOVING_B: FixtureSample[] = [
  s(0.0, [750.0, 350.0, 850.0, 450.0]),
  s(0.25, [820.0, 350.0, 920.0, 450.0]),
  s(0.5, [820.0, 401.0, 920.0, 501.0]),
  s(0.75, [787.38, 399.84, 887.38, 499.84]),
];

const ok = (samples: V513MotionSample[]) =>
  computeV513MotionTelemetry({ samples, trackOk: true, reason: null });

Deno.test("A) box semantics are [x1,y1,x2,y2]", () => {
  const out = ok([
    s(0, [826, 78, 896, 207]),
    s(1, [826, 78, 896, 207]),
    s(2, [826, 78, 896, 207]),
  ]);
  assertEquals(out.status, "ok");
  // side = max(896-826, 207-78) = 129, NOT max(896, 207).
  assertEquals(out.median_side_px, 129);
  // Static geometry → zero translation regardless of absolute position.
  assertEquals(out.net_displacement_norm, 0);
  assertEquals(out.path_length_norm, 0);
});

Deno.test("A2) center is the midpoint, not origin + half of x2/y2", () => {
  // Two boxes sharing the same midpoint x but different width would move if
  // the helper used [x, y, w, h] semantics.
  const out = ok([
    s(0, [800, 400, 900, 500]),
    s(1, [810, 410, 890, 490]),
    s(2, [800, 400, 900, 500]),
  ]);
  // Midpoints: 850, 850, 850 → no translation.
  assertEquals(out.center_x_range_norm, 0);
  assertEquals(out.net_displacement_norm, 0);
  assert(metric(out.side_range_norm) > 0);
});

Deno.test("B) Golden A low-motion fixture", () => {
  const out = ok(GOLDEN_A);
  assertEquals(out.status, "ok");
  assertEquals(out.median_side_px, 100);
  assertAlmostEquals(metric(out.path_length_norm), 0.044, 0.002);
  assertAlmostEquals(metric(out.net_displacement_norm), 0.042, 0.002);
});

Deno.test("C) Moving B fixture", () => {
  const out = ok(MOVING_B);
  assertEquals(out.status, "ok");
  assertAlmostEquals(metric(out.path_length_norm), 1.537, 0.01);
  assertAlmostEquals(metric(out.net_displacement_norm), 0.623, 0.01);
  assert(metric(out.max_step_norm) > metric(out.mean_step_norm));
});

Deno.test("D) normalization invariance under 2x pixel scale", () => {
  const scaled = MOVING_B.map((x) =>
    s(x.t, x.box.map((v) => v * 2) as Box)
  );
  const a = ok(MOVING_B);
  const b = ok(scaled);
  assertAlmostEquals(metric(b.path_length_norm), metric(a.path_length_norm), 0.002);
  assertAlmostEquals(metric(b.net_displacement_norm), metric(a.net_displacement_norm), 0.002);
  assertAlmostEquals(metric(b.center_range_norm), metric(a.center_range_norm), 0.002);
  assertAlmostEquals(metric(b.max_step_norm), metric(a.max_step_norm), 0.002);
  assertEquals(metric(b.median_side_px), metric(a.median_side_px) * 2);
});

Deno.test("E1) no_plate_box when samples are null", () => {
  const out = computeV513MotionTelemetry({ samples: null, trackOk: undefined, reason: null });
  assertEquals(out.status, "no_plate_box");
  assertEquals(out.sample_count, 0);
  assertUnavailableMetrics(out);
});

Deno.test("E2) track_failed when the track returned ok=false", () => {
  const out = computeV513MotionTelemetry({
    samples: [],
    trackOk: false,
    reason: "track_budget_exceeded",
  });
  assertEquals(out.status, "track_failed");
  assertEquals(out.reason, "track_budget_exceeded");
  assertUnavailableMetrics(out);
});

Deno.test("E3) track_failed when the track threw", () => {
  const out = computeV513MotionTelemetry({
    samples: [],
    trackOk: false,
    reason: "track_threw:boom",
  });
  assertEquals(out.status, "track_failed");
  assertEquals(out.reason, "track_threw:boom");
  assertUnavailableMetrics(out);
});

Deno.test("E4) insufficient_samples below 3 usable boxes", () => {
  const out = ok([s(0, [750, 350, 850, 450]), s(1, [752, 350, 852, 450])]);
  assertEquals(out.status, "insufficient_samples");
  assertEquals(out.sample_count, 2);
  assertUnavailableMetrics(out);
});

Deno.test("E5) undefined trackOk with insufficient samples is not track_failed", () => {
  const out = computeV513MotionTelemetry({
    samples: [],
    trackOk: undefined,
    reason: "not_attempted",
  });
  assertEquals(out.status, "insufficient_samples");
  assertEquals(out.sample_count, 0);
  assertUnavailableMetrics(out);
});

Deno.test("E6) ok with exactly 3 usable samples, non-finite boxes dropped", () => {
  const out = ok([
    s(0, [750, 350, 850, 450]),
    s(1, [752, 350, 852, 450]),
    s(1.5, [Number.NaN, 10, 20, 30]),
    s(2, [754, 350, 854, 450]),
  ]);
  assertEquals(out.status, "ok");
  assertEquals(out.sample_count, 3);
});

Deno.test("F1) JSON safety, audited version, and reason cap", () => {
  const long = "x".repeat(500);
  const failed = computeV513MotionTelemetry({ samples: [], trackOk: false, reason: long });
  assertEquals(failed.reason?.length, 200);

  const out = ok([
    s(0, [750, 350, 850, 450]),
    s(1, [Number.NaN, 350, 852, 450]),
    s(2, [752, 350, 852, 450]),
    s(3, [754, 350, 854, 450]),
  ]);
  const json = JSON.parse(JSON.stringify(out));
  for (const [k, v] of Object.entries(json)) {
    if (typeof v === "number") assert(Number.isFinite(v), `${k} not finite`);
  }
  assertEquals(json.version, "v513-t0");
  assert(!("score" in json));
  assert(!("moving" in json));
});

Deno.test("F2) reason normalization preserves whitespace", () => {
  const reason = "  track failed\nwith context  ";
  const out = computeV513MotionTelemetry({ samples: [], trackOk: false, reason });
  assertEquals(out.reason, reason);
});

Deno.test("G1) side_change_pct uses range divided by minimum side", () => {
  const out = ok([
    s(0, [0, 0, 100, 100]),
    s(1, [-10, -10, 110, 110]),
    s(2, [-25, -25, 125, 125]),
  ]);
  assertEquals(out.status, "ok");
  // ((150 - 100) / 100) * 100 = 50, not range / median side.
  assertEquals(out.side_change_pct, 50);
});

Deno.test("G2) second difference diagnostic uses maximum, not mean", () => {
  const centers = [0, 1, 4, 8];
  const samples = centers.map((cx, t) =>
    s(t, [cx - 50, -50, cx + 50, 50])
  );
  const out = ok(samples);
  assertEquals(out.status, "ok");
  // Second-difference magnitudes are 2 and 1 px. max / medianSide = 2/100.
  assertEquals(out.second_difference_norm_diagnostic, 0.02);
  assert(out.second_difference_norm_diagnostic !== 0.015);
});
