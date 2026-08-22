/**
 * V453 — Raster-Collagen (2x2) müssen als Split-Screen erkannt werden.
 *
 * Referenzfall: Szene be60d106… (Rooftop-Test, 2026-08-22). Der Anker war ein
 * 1376x768 großes 2x2-Kachelbild mit vier Portraits auf zwei Baselines. Der
 * Einreihen-Klassifizierer aus V445/V447 konnte das nicht sehen, weil seine
 * erste harte Bedingung eine gemeinsame Baseline ist.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifySplitScreenLayout } from "./split-screen-layout.ts";

/** be60d106 anchor, in normalized 1000x1000 detector space. */
const ROOFTOP_2X2_BOXES = [
  { x: 194, y: 118, width: 80, height: 100 }, // top-left
  { x: 737, y: 112, width: 80, height: 100 }, // top-right
  { x: 238, y: 608, width: 80, height: 100 }, // bottom-left
  { x: 710, y: 608, width: 80, height: 100 }, // bottom-right
];

Deno.test("v453: the 2x2 rooftop anchor collage is a panel layout", () => {
  const v = classifySplitScreenLayout(ROOFTOP_2X2_BOXES, 1000, 1000);
  assertEquals(v.isSplitScreen, true);
  assertEquals(typeof v.reason, "string");
  assertEquals((v.reason ?? "").startsWith("split_screen_grid("), true);
});

Deno.test("v453: a genuine group shot staged in depth is not a grid", () => {
  const boxes = [
    { x: 120, y: 250, width: 150, height: 195 },
    { x: 380, y: 330, width: 120, height: 160 },
    { x: 600, y: 240, width: 165, height: 210 },
    { x: 800, y: 360, width: 105, height: 140 },
  ];
  assertEquals(classifySplitScreenLayout(boxes, 1000, 1000).isSplitScreen, false);
});

Deno.test("v453: two rows with different face counts are not a grid", () => {
  const boxes = [
    { x: 194, y: 118, width: 80, height: 100 },
    { x: 500, y: 112, width: 80, height: 100 },
    { x: 737, y: 115, width: 80, height: 100 },
    { x: 470, y: 608, width: 80, height: 100 },
  ];
  const v = classifySplitScreenLayout(boxes, 1000, 1000);
  assertEquals((v.reason ?? "").startsWith("split_screen_grid("), false);
});

Deno.test("v453: a two-shot with one person further back stays allowed", () => {
  const boxes = [
    { x: 150, y: 200, width: 170, height: 220 },
    { x: 620, y: 430, width: 95, height: 120 },
    { x: 800, y: 250, width: 150, height: 200 },
  ];
  assertEquals(classifySplitScreenLayout(boxes, 1000, 1000).isSplitScreen, false);
});
