/**
 * V446 regressions — the split-screen verdict must already fire on the
 * ANCHOR STILL, in the normalized (1000x1000) detector space that
 * `compose-video-clips` uses for the anchor probe.
 *
 * Reference case: scene e658509d… (2026-08-22). The composed anchor was a
 * 896x1195 four-column strip collage; the plate gate only caught the panel
 * layout after all six clips had been rendered and refunded.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifySplitScreenLayout } from "./split-screen-layout.ts";

/** S11 anchor: four equal vertical strips, faces on one shared eye-line. */
const S11_ANCHOR_BOXES_NORMALIZED = [
  { x: 60, y: 300, width: 105, height: 140 },
  { x: 250, y: 296, width: 100, height: 135 },
  { x: 440, y: 298, width: 105, height: 140 },
  { x: 640, y: 294, width: 110, height: 145 },
];

Deno.test("v446: the S11 anchor strip collage is a panel layout in normalized space", () => {
  const v = classifySplitScreenLayout(S11_ANCHOR_BOXES_NORMALIZED, 1000, 1000);
  assertEquals(v.isSplitScreen, true);
  assertEquals(typeof v.reason, "string");
});

Deno.test("v446: a genuine group anchor is not blocked", () => {
  // Same room, staged in depth: different baselines and face scales.
  const boxes = [
    { x: 120, y: 250, width: 150, height: 195 },
    { x: 380, y: 330, width: 120, height: 160 },
    { x: 600, y: 240, width: 165, height: 210 },
    { x: 800, y: 360, width: 105, height: 140 },
  ];
  assertEquals(classifySplitScreenLayout(boxes, 1000, 1000).isSplitScreen, false);
});

Deno.test("v446: fewer than three detected faces never yields a panel verdict", () => {
  const boxes = [
    { x: 100, y: 300, width: 120, height: 160 },
    { x: 600, y: 300, width: 120, height: 160 },
  ];
  assertEquals(classifySplitScreenLayout(boxes, 1000, 1000).isSplitScreen, false);
});
