import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { decidePlateAttempt } from "./plate-attempt.ts";

const scene = (gen: number) => ({ plate_generation: gen });

Deno.test("v375: current attempt on current generation passes", () => {
  const r = decidePlateAttempt({
    scene: scene(13),
    attempt: { id: "a1", status: "rendering", expected_plate_generation: 13 },
  });
  assertEquals(r.ok, true);
  assertEquals(r.verdict, "current");
});

Deno.test("v375: the exact reset race — gen-12 job calling back after bump to 13", () => {
  const r = decidePlateAttempt({
    scene: scene(13),
    attempt: { id: "a1", status: "superseded", expected_plate_generation: 12 },
  });
  assertEquals(r.ok, false);
  assertEquals(r.verdict, "superseded");
});

Deno.test("v375: generation mismatch blocks even when the tombstone is missing", () => {
  const r = decidePlateAttempt({
    scene: scene(13),
    attempt: { id: "a1", status: "rendering", expected_plate_generation: 12 },
  });
  assertEquals(r.ok, false);
  assertEquals(r.verdict, "generation_mismatch");
});

Deno.test("v375: duplicate callback for an already delivered attempt is dropped", () => {
  const r = decidePlateAttempt({
    scene: scene(4),
    attempt: { id: "a1", status: "completed", expected_plate_generation: 4 },
  });
  assertEquals(r.ok, false);
  assertEquals(r.verdict, "already_completed");
});

Deno.test("v375: unregistered jobs (pre-v375 / upload / stock) are not blocked", () => {
  const r = decidePlateAttempt({ scene: scene(1), attempt: null });
  assertEquals(r.ok, true);
  assertEquals(r.verdict, "unregistered");
});

Deno.test("v375: a deleted scene never accepts a write", () => {
  const r = decidePlateAttempt({
    scene: null,
    attempt: { id: "a1", status: "rendering", expected_plate_generation: 2 },
  });
  assertEquals(r.ok, false);
  assertEquals(r.verdict, "scene_missing");
});

Deno.test("v375: missing plate_generation defaults to 1", () => {
  const r = decidePlateAttempt({
    scene: {},
    attempt: { id: "a1", status: "rendering", expected_plate_generation: 1 },
  });
  assertEquals(r.ok, true);
  assertEquals(r.currentGeneration, 1);
});
