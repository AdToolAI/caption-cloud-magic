import {
  assert,
  assertAlmostEquals,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computeV513MotionTelemetry } from "./v513-motion-telemetry.ts";

type Box = [number, number, number, number];

const s = (t: number, box: Box) => ({ t, box });

// Golden A — near-static: path ≈ 0.044, net ≈ 0.042 (median face side = 100 px).
const GOLDEN_A = [
  s(0.0, [750.0, 350, 850.0, 450]),
  s(0.25, [752.3, 350, 852.3, 450]),
  s(0.5, [752.2, 350, 852.2, 450]),
  s(0.75, [754.2, 350, 854.2, 450]),
];

// Moving B — path ≈ 1.537, net ≈ 0.623 (median face side = 100 px).
const MOVING_B = [
  s(0.0, [750.0, 350.0, 850.0, 450.0]),
  s(0.25, [820.0, 350.0, 920.0, 450.0]),
  s(0.5, [820.0, 401.0, 920.0, 501.0]),
  s(0.75, [787.38, 399.84, 887.38, 499.84]),
];

const ok = (samples: unknown[]) =>
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
    s(1, [810, 400, 890, 500]),
    s(2, [800, 400, 900, 500]),
  ]);
  // Midpoints: 850, 850, 850 → no translation.
  assertEquals(out.center_x_range_norm, 0);
  assertEquals(out.net_displacement_norm, 0);
  assert(out.side_range_norm > 0);
});

Deno.test("B) Golden A low-motion fixture", () => {
  const out = ok(GOLDEN_A);
  assertEquals(out.status, "ok");
  assertEquals(out.median_side_px, 100);
  assertAlmostEquals(out.path_length_norm, 0.044, 0.002);
  assertAlmostEquals(out.net_displacement_norm, 0.042, 0.002);
});

Deno.test("C) Moving B fixture", () => {
  const out = ok(MOVING_B);
  assertEquals(out.status, "ok");
  assertAlmostEquals(out.path_length_norm, 1.537, 0.01);
  assertAlmostEquals(out.net_displacement_norm, 0.623, 0.01);
  assert(out.max_step_norm > out.mean_step_norm);
});

Deno.test("D) normalization invariance under 2x pixel scale", () => {
  const scaled = MOVING_B.map((x) =>
    s(x.t, x.box.map((v) => v * 2) as Box)
  );
  const a = ok(MOVING_B);
  const b = ok(scaled);
  assertAlmostEquals(b.path_length_norm, a.path_length_norm, 0.002);
  assertAlmostEquals(b.net_displacement_norm, a.net_displacement_norm, 0.002);
  assertAlmostEquals(b.center_range_norm, a.center_range_norm, 0.002);
  assertAlmostEquals(b.max_step_norm, a.max_step_norm, 0.002);
  assertEquals(b.median_side_px, a.median_side_px * 2);
});

Deno.test("E1) no_plate_box when samples are null", () => {
  const out = computeV513MotionTelemetry({ samples: null, trackOk: undefined, reason: null });
  assertEquals(out.status, "no_plate_box");
  assertEquals(out.sample_count, 0);
});

Deno.test("E2) track_failed when the track returned ok=false", () => {
  const out = computeV513MotionTelemetry({
    samples: [],
    trackOk: false,
    reason: "track_budget_exceeded",
  });
  assertEquals(out.status, "track_failed");
  assertEquals(out.reason, "track_budget_exceeded");
});

Deno.test("E3) track_failed when the track threw", () => {
  const out = computeV513MotionTelemetry({
    samples: [],
    trackOk: false,
    reason: "track_threw:boom",
  });
  assertEquals(out.status, "track_failed");
  assertEquals(out.reason, "track_threw:boom");
});

Deno.test("E4) insufficient_samples below 3 usable boxes", () => {
  const out = ok([s(0, [750, 350, 850, 450]), s(1, [752, 350, 852, 450])]);
  assertEquals(out.status, "insufficient_samples");
  assertEquals(out.sample_count, 2);
});

Deno.test("E5) ok with exactly 3 usable samples, degenerate boxes dropped", () => {
  const out = ok([
    s(0, [750, 350, 850, 450]),
    s(1, [752, 350, 852, 450]),
    { t: 1.5, box: [10, 10, 5, 5] },
    s(2, [754, 350, 854, 450]),
  ]);
  assertEquals(out.status, "ok");
  assertEquals(out.sample_count, 3);
});

Deno.test("F) JSON safety and reason cap", () => {
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
  assertEquals(json.version, 513);
  assert(!("score" in json));
  assert(!("moving" in json));
});
