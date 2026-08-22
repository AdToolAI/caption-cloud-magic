/**
 * V452 — dynamic face tracking contract tests.
 *
 * Covers the two hard invariants of the gate:
 *   A) path/static parity — a non-moving track renders the EXACT frozen crop,
 *      and preclip + T13 use one single inclusion predicate;
 *   C) identity is static — the tracking primitive continues the assigned face
 *      or refuses, but never switches to another cast slot.
 */

import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildDynamicCameraPath,
  densifySamplesToFrames,
  sampleCameraPath,
  shouldUseCameraPath,
  type TrackSample,
} from "./dynamic-camera-path.ts";
import { pickAssignedFace } from "./plate-face-track.ts";

const STATIC_CROP = { x: 400, y: 200, size: 512, outputSize: 512 };
const SRC = { srcWidth: 1920, srcHeight: 1080 };

function sample(t: number, cx: number, cy: number, mouthDy = 90): TrackSample {
  const h = 180;
  return {
    t,
    box: [cx - 90, cy - h / 2, cx + 90, cy + h / 2],
    mouth: [cx, cy + mouthDy],
  };
}

// ── A.1 — static equivalence is EXACTLY the frozen crop ────────────────────

Deno.test("V452 A.1 — non-moving face yields the exact static crop at t=0/mid/end", () => {
  // Face parked in one place; the mouth estimate deliberately differs from the
  // static crop centre — the path must NOT drift towards it.
  const samples = [0, 1, 2, 3].map((i) => sample(i, 700, 380));
  const path = buildDynamicCameraPath({
    samples,
    staticCrop: STATIC_CROP,
    ...SRC,
    startSec: 0,
    endSec: 3,
  });

  assertFalse(path.moving, "a parked face must not be reported as moving");
  assertFalse(shouldUseCameraPath(path), "static-equivalent paths are never used dynamically");
  for (const t of [0, 1.5, 3]) {
    const s = sampleCameraPath(path, t)!;
    assertEquals(s.x, STATIC_CROP.x);
    assertEquals(s.y, STATIC_CROP.y);
    assertEquals(s.size, STATIC_CROP.size);
  }
});

// ── A.2 — one predicate for preclip and T13 ────────────────────────────────

Deno.test("V452 A.2 — inclusion predicate rejects every non-moving/incomplete path", () => {
  assertFalse(shouldUseCameraPath(null));
  assertFalse(shouldUseCameraPath(undefined));
  assertFalse(
    shouldUseCameraPath({
      keyframes: [{ t: 0, x: 1, y: 1, size: 512, mx: null, my: null, src: "static" }],
      moving: true,
      signature: "sig",
    } as never),
    "a single keyframe is not a movement",
  );
  assertFalse(
    shouldUseCameraPath({
      keyframes: [
        { t: 0, x: 1, y: 1, size: 512, mx: null, my: null, src: "mouth" },
        { t: 1, x: 9, y: 9, size: 512, mx: null, my: null, src: "mouth" },
      ],
      moving: false,
      signature: "sig",
    } as never),
    "moving=false is never followed",
  );
  assertFalse(
    shouldUseCameraPath({
      keyframes: [
        { t: 0, x: 1, y: 1, size: 512, mx: null, my: null, src: "mouth" },
        { t: 1, x: 9, y: 9, size: 512, mx: null, my: null, src: "mouth" },
      ],
      moving: true,
      signature: "",
    } as never),
    "an unsigned path is not reusable",
  );
});

Deno.test("V452 A.2 — the runtime mirror uses the identical predicate", async () => {
  const runtime = await Deno.readTextFile(
    new URL("../../../src/lib/composer/cameraPathRuntime.ts", import.meta.url),
  );
  for (const clause of [
    "path.moving === true",
    "path.keyframes.length > 1",
    'typeof path.signature === "string"',
    "path.signature.length > 0",
  ]) {
    assert(runtime.includes(clause), `runtime predicate must contain: ${clause}`);
  }
  for (const tpl of ["DialogTurnFaceCropVideo", "DialogStitchVideo"]) {
    const src = await Deno.readTextFile(
      new URL(`../../../src/remotion/templates/${tpl}.tsx`, import.meta.url),
    );
    assert(src.includes("isDynamicPathRuntime("), `${tpl} must gate on the shared predicate`);
  }
  const mux = await Deno.readTextFile(
    new URL("../render-sync-segments-audio-mux/index.ts", import.meta.url),
  );
  assert(mux.includes("shouldUseCameraPath(cp)"), "mux must gate on the shared predicate");
});

Deno.test("V452 A.2 — Deno sampler and runtime sampler agree frame by frame", async () => {
  const { sampleCameraPathRuntime, isDynamicPathRuntime } = await import(
    "../../../src/lib/composer/cameraPathRuntime.ts"
  );
  const samples = [0, 1, 2, 3, 4].map((i) => sample(i, 600 + i * 120, 380 + i * 20));
  const path = buildDynamicCameraPath({
    samples,
    staticCrop: STATIC_CROP,
    ...SRC,
    startSec: 0,
    endSec: 4,
  });
  assertEquals(isDynamicPathRuntime(path as never), shouldUseCameraPath(path));
  for (let f = 0; f <= 120; f++) {
    const t = f / 30;
    const a = sampleCameraPath(path, t)!;
    const b = sampleCameraPathRuntime(path as never, t)!;
    assertEquals(Number(a.x.toFixed(6)), Number(b.x.toFixed(6)), `x mismatch at t=${t}`);
    assertEquals(Number(a.y.toFixed(6)), Number(b.y.toFixed(6)), `y mismatch at t=${t}`);
    assertEquals(a.size, b.size);
  }
});

// ── movement + frozen size authority ───────────────────────────────────────

Deno.test("V452 — a walking face produces a moving path with UNCHANGED crop size", () => {
  const samples = [0, 1, 2, 3, 4].map((i) => sample(i, 600 + i * 120, 380 + i * 20));
  const path = buildDynamicCameraPath({
    samples,
    staticCrop: STATIC_CROP,
    ...SRC,
    startSec: 0,
    endSec: 4,
  });
  assert(path.moving, "a travelling face must move the window");
  assert(shouldUseCameraPath(path));
  assert(path.keyframes.length > 1);
  for (const k of path.keyframes) assertEquals(k.size, STATIC_CROP.size);
  const first = sampleCameraPath(path, 0)!;
  const last = sampleCameraPath(path, 4)!;
  assert(Math.abs(last.x - first.x) > 50, "window must follow the walk");
  assertEquals(last.size, STATIC_CROP.size);
});

Deno.test("V452 — densification is deterministic and per-frame", () => {
  const samples = [sample(0, 600, 380), sample(2, 900, 380)];
  const a = densifySamplesToFrames(samples, 0, 2, 30);
  const b = densifySamplesToFrames(samples, 0, 2, 30);
  assertEquals(a.boxes.length, 60);
  assertEquals(JSON.stringify(a.boxes), JSON.stringify(b.boxes));
  assert(a.boxes.every((x) => !!x), "every frame must carry a box");
});

// ── C — identity-static regressions on the tracking primitive ──────────────

const REF: [number, number, number, number] = [500, 300, 700, 540];

Deno.test("V452 C1 — continuation of the assigned face is accepted", () => {
  const moved: [number, number, number, number] = [520, 310, 720, 550];
  const picked = pickAssignedFace([{ bbox: moved, mouth: [620, 500] }], REF, [[1400, 400]]);
  assert(picked, "a slightly moved same face must be accepted");
  assertEquals(picked!.bbox, moved);
});

Deno.test("V452 C2 — sibling veto prevents a switch to another cast slot", () => {
  const sibling: [number, number, number, number] = [1300, 300, 1500, 540];
  const picked = pickAssignedFace(
    [{ bbox: sibling, mouth: [1400, 500] }],
    REF,
    [[1400, 420]],
  );
  assertEquals(picked, null, "a face sitting on a sibling lock is never our speaker");
});

Deno.test("V452 C3 — ambiguous/crossing candidates return null instead of switching", () => {
  const a: [number, number, number, number] = [560, 300, 760, 540];
  const b: [number, number, number, number] = [440, 300, 640, 540];
  const picked = pickAssignedFace(
    [{ bbox: a, mouth: null }, { bbox: b, mouth: null }],
    REF,
    [],
  );
  assertEquals(picked, null, "two equally plausible faces = no provable continuation");
});

Deno.test("V452 C4 — a missing sample is interpolated, never re-identified", () => {
  const samples: TrackSample[] = [
    sample(0, 600, 380),
    { t: 1, box: null, mouth: null },
    sample(2, 900, 380),
  ];
  const path = buildDynamicCameraPath({
    samples,
    staticCrop: STATIC_CROP,
    ...SRC,
    startSec: 0,
    endSec: 2,
  });
  assertEquals(path.validSamples, 2);
  assertEquals(path.reason, "partial_track");
  // The gap is filled between the two measured positions — no third identity.
  const mid = sampleCameraPath(path, 1)!;
  const first = sampleCameraPath(path, 0)!;
  const last = sampleCameraPath(path, 2)!;
  assert(mid.x >= Math.min(first.x, last.x) - 1 && mid.x <= Math.max(first.x, last.x) + 1);
});

Deno.test("V452 C5 — V450 NOOP retry reuses the frozen path and never tracks", async () => {
  const src = await Deno.readTextFile(new URL("./pass-face-preclip.ts", import.meta.url));
  const i = src.indexOf("frozenCameraPath");
  assert(i > 0, "frozen path input must exist");
  // The builder must only run when no frozen path was handed in.
  assert(
    /frozenCameraPath\s*\?[\s\S]{0,400}buildCameraPath/.test(src) ||
      /if\s*\(\s*input\.frozenCameraPath\s*\)/.test(src) ||
      src.includes("v452_camera_path_frozen"),
    "frozen path must short-circuit the tracking builder",
  );
});
