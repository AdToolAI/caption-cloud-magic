import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildV513MotionTelemetry } from "./v513-motion-telemetry.ts";

const PLATE = { plateWidth: 1920, plateHeight: 1080 };
const BOX: [number, number, number, number] = [100, 100, 200, 200];

function samples(n: number, moving = true) {
  return Array.from({ length: n }, (_, i) => ({
    t: i * 0.25,
    box: [100 + (moving ? i * 10 : 0), 100, 200, 200],
    mouth: [200 + (moving ? i * 10 : 0), 250],
  }));
}

Deno.test("no_plate_box when the assignment box is missing", () => {
  const out = buildV513MotionTelemetry({ plateBox: null, track: { ok: true, samples: samples(4) }, ...PLATE });
  assertEquals(out.status, "no_plate_box");
});

Deno.test("track_failed when the track threw", () => {
  const out = buildV513MotionTelemetry({
    plateBox: BOX,
    track: null,
    threw: true,
    threwReason: "boom",
    ...PLATE,
  });
  assertEquals(out.status, "track_failed");
  assertEquals(out.reason, "boom");
});

Deno.test("track_failed when the track reports not-ok", () => {
  const out = buildV513MotionTelemetry({ plateBox: BOX, track: { ok: false, reason: "detector_empty" }, ...PLATE });
  assertEquals(out.status, "track_failed");
  assertEquals(out.reason, "detector_empty");
});

Deno.test("insufficient_samples with fewer than two valid boxes", () => {
  const out = buildV513MotionTelemetry({ plateBox: BOX, track: { ok: true, samples: samples(1) }, ...PLATE });
  assertEquals(out.status, "insufficient_samples");
  assertEquals(out.samples_valid, 1);
});

Deno.test("ok computes finite motion descriptors", () => {
  const out = buildV513MotionTelemetry({ plateBox: BOX, track: { ok: true, samples: samples(5), latencyMs: 1234 }, ...PLATE });
  assertEquals(out.status, "ok");
  assertEquals(out.samples_total, 5);
  assertEquals(out.samples_valid, 5);
  assertEquals(out.samples_with_mouth, 5);
  assertEquals(out.track_latency_ms, 1234);
  for (const [k, v] of Object.entries(out)) {
    if (typeof v === "number") {
      assertEquals(Number.isFinite(v), true, `${k} must be finite`);
    }
  }
  assertEquals(JSON.parse(JSON.stringify(out)).status, "ok");
});

Deno.test("non-finite inputs never leak into the payload", () => {
  const out = buildV513MotionTelemetry({
    plateBox: BOX,
    track: {
      ok: true,
      latencyMs: Number.NaN,
      samples: [
        { t: 0, box: [0, 0, 100, 100], mouth: [Number.NaN, 10] },
        { t: Number.NaN, box: [10, 0, 100, 100], mouth: [50, 60] },
        { t: 0.5, box: [0, 0, 0, 0], mouth: null },
      ],
    },
    ...PLATE,
  });
  for (const v of Object.values(out)) {
    if (typeof v === "number") assertEquals(Number.isFinite(v), true);
  }
});

Deno.test("reason is capped at 200 characters", () => {
  const out = buildV513MotionTelemetry({ plateBox: BOX, track: { ok: false, reason: "x".repeat(500) }, ...PLATE });
  assertEquals(out.reason?.length, 200);
});
