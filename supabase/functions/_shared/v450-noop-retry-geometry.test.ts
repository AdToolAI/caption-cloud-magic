/**
 * V450 — frozen NOOP-retry wire vs. V445 geometry-coherence guard.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  decideCachedPreclipDrop,
  parseImmutableArtifactKey,
  recoverFrozenPreclip,
} from "./v450-noop-retry-geometry.ts";

const SCENE = "be60d106-6908-4002-95d1-2bd01c5cfa6c";
const RUN = "run-abc";
const KEY = `uid/v434/${SCENE}/run-${RUN}/gen-3/pass-0/preclip-a0.mp4`;
const CROP = { x: 10, y: 20, size: 272, outputSize: 720 };

Deno.test("v450: fresh dispatch still drops a geometry-incoherent cached preclip", () => {
  const d = decideCachedPreclipDrop({
    hasCachedPreclip: true,
    cachedBoxSig: "1,2,3,4",
    finalBoxSig: "9,9,9,9",
    noopAutoEscalation: false,
  });
  assertEquals(d.drop, true);
  assertEquals(d.tag, "v445_cached_crop_geometry_mismatch");
});

Deno.test("v450: NOOP retry keeps the frozen preclip despite geometry drift", () => {
  const d = decideCachedPreclipDrop({
    hasCachedPreclip: true,
    cachedBoxSig: "1,2,3,4",
    finalBoxSig: "9,9,9,9",
    noopAutoEscalation: true,
  });
  assertEquals(d.drop, false);
  assertEquals(d.tag, "v450_noop_retry_geometry_drift_ignored");
});

Deno.test("v450: coherent geometry is a no-op for both paths", () => {
  for (const noop of [true, false]) {
    const d = decideCachedPreclipDrop({
      hasCachedPreclip: true,
      cachedBoxSig: "1,2,3,4",
      finalBoxSig: "1,2,3,4",
      noopAutoEscalation: noop,
    });
    assertEquals(d.drop, false);
    assertEquals(d.tag, "coherent");
  }
});

Deno.test("v450: artifact key parses run / generation / pass", () => {
  assertEquals(parseImmutableArtifactKey(KEY), {
    sceneId: SCENE,
    runId: RUN,
    generation: 3,
    passIdx: 0,
    kind: "preclip",
  });
  assertEquals(parseImmutableArtifactKey("garbage"), null);
});

Deno.test("v450: recovery succeeds only with a fully proven snapshot", () => {
  const r = recoverFrozenPreclip({
    noopAutoEscalation: true,
    sceneId: SCENE,
    runId: RUN,
    generation: 3,
    passIdx: 0,
    pin: { key: KEY, url: "https://pins/preclip.mp4" },
    frozenCrop: CROP,
  });
  assertEquals(r.ok, true);
  if (r.ok) {
    assertEquals(r.url, "https://pins/preclip.mp4");
    assertEquals(r.crop, CROP);
  }
});

Deno.test("v450: MP4 URL without a crop is NOT enough (fail-closed)", () => {
  const r = recoverFrozenPreclip({
    noopAutoEscalation: true,
    sceneId: SCENE,
    runId: RUN,
    generation: 3,
    passIdx: 0,
    pin: { key: KEY, url: "https://pins/preclip.mp4" },
    frozenCrop: null,
  });
  assertEquals(r, { ok: false, reason: "crop_not_reconstructible" });
});

Deno.test("v450: run / generation / pass mismatches are all rejected", () => {
  const base = {
    noopAutoEscalation: true as const,
    sceneId: SCENE,
    runId: RUN,
    generation: 3,
    passIdx: 0,
    pin: { key: KEY, url: "https://pins/preclip.mp4" },
    frozenCrop: CROP,
  };
  assertEquals(recoverFrozenPreclip({ ...base, runId: "other-run" }), {
    ok: false,
    reason: "run_id_mismatch",
  });
  assertEquals(recoverFrozenPreclip({ ...base, generation: 4 }), {
    ok: false,
    reason: "plate_generation_mismatch",
  });
  assertEquals(recoverFrozenPreclip({ ...base, passIdx: 1 }), {
    ok: false,
    reason: "pass_mismatch",
  });
  assertEquals(recoverFrozenPreclip({ ...base, sceneId: "other-scene" }), {
    ok: false,
    reason: "scene_mismatch",
  });
  assertEquals(recoverFrozenPreclip({ ...base, pin: null }), {
    ok: false,
    reason: "no_immutable_pin",
  });
});

Deno.test("v450: recovery never runs outside a NOOP retry", () => {
  assertEquals(
    recoverFrozenPreclip({
      noopAutoEscalation: false,
      sceneId: SCENE,
      runId: RUN,
      generation: 3,
      passIdx: 0,
      pin: { key: KEY, url: "https://pins/preclip.mp4" },
      frozenCrop: CROP,
    }),
    { ok: false, reason: "not_a_noop_retry" },
  );
});
