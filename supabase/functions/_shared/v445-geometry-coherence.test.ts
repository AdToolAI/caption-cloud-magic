/**
 * V445 regressions — split-screen classifier + crop/dispatch geometry coherence.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifySplitScreenLayout } from "./split-screen-layout.ts";
import { buildDispatchFaceBox, faceBoxSignature, sanitizeMeasureSource } from "./plate-face-dispatch-box.ts";
import { computeMouthCenteredCrop } from "./compute-mouth-centered-crop.ts";

Deno.test("v445: production S11 quad panel plate is classified as split-screen", () => {
  // Face centers 176/283, 486/278, 804/285, 1135/276 on a 1280x720 plate,
  // with clearly unequal panel face heights (old h-spread gate missed it).
  const boxes = [
    { x: 136, y: 223, width: 80, height: 120 },
    { x: 441, y: 218, width: 90, height: 120 },
    { x: 764, y: 215, width: 80, height: 140 },
    { x: 1090, y: 206, width: 90, height: 140 },
  ];
  const v = classifySplitScreenLayout(boxes, 1280, 720);
  assertEquals(v.isSplitScreen, true);
  assertEquals(typeof v.reason, "string");
});

Deno.test("v445: a natural staged scene is NOT classified as split-screen", () => {
  const boxes = [
    { x: 120, y: 120, width: 140, height: 180 },
    { x: 520, y: 320, width: 150, height: 190 },
    { x: 980, y: 150, width: 130, height: 170 },
  ];
  assertEquals(classifySplitScreenLayout(boxes, 1280, 720).isSplitScreen, false);
});

Deno.test("v445: fewer than 3 faces never trips the detector", () => {
  const boxes = [
    { x: 100, y: 200, width: 100, height: 130 },
    { x: 600, y: 200, width: 100, height: 130 },
  ];
  assertEquals(classifySplitScreenLayout(boxes, 1280, 720).isSplitScreen, false);
});

Deno.test("v445: dispatch box padding is deterministic and clamped to the plate", () => {
  const box = buildDispatchFaceBox([100, 100, 200, 250], { width: 1280, height: 720 });
  assertEquals(box, [92, 91, 208, 256]);
  assertEquals(faceBoxSignature(box), "92,91,208,256");
  assertEquals(buildDispatchFaceBox([0, 0, 0, 0], { width: 1280, height: 720 }), null);
});

Deno.test("v445: crop always contains the face bbox (S11 212x281 vs 272x272)", () => {
  // Face near the plate edge — pre-V445 the crop shrank below the face height.
  const faceW = 212;
  const faceH = 281;
  const x1 = 1280 - faceW - 4;
  const y1 = 8;
  const r = computeMouthCenteredCrop({
    plateWidth: 1280,
    plateHeight: 720,
    faceBbox: [x1, y1, x1 + faceW, y1 + faceH],
    mouth: [x1 + faceW / 2, y1 + faceH * 0.75],
  });
  if (r.size < Math.max(faceW, faceH)) {
    throw new Error(`crop size ${r.size} smaller than face ${faceW}x${faceH}`);
  }
});

Deno.test("v445: measurement source label carries no signature/credentials", () => {
  const src = sanitizeMeasureSource("https://x.supabase.co/storage/v1/o/plate.mp4?token=SECRET&sig=abc");
  assertEquals(src, "https://x.supabase.co/storage/v1/o/plate.mp4");
});
