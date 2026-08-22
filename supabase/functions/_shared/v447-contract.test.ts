/**
 * v447-contract.test.ts — V447
 *
 * 1. Two-panel collages (N=2) are now classified as split screens.
 * 2. A genuine two-shot (people not on the column centers) is NOT blocked.
 * 3. Preclip reuse signatures are fail-closed without run identity and
 *    change with run, generation, plate, geometry and render window.
 */

import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { classifySplitScreenLayout } from "./split-screen-layout.ts";
import { buildPreclipSignature } from "./pass-face-preclip.ts";

const W = 1280;
const H = 720;

Deno.test("v447: a two-column collage is a panel layout", () => {
  const boxes = [
    { x: 280, y: 250, width: 80, height: 100 },
    { x: 920, y: 252, width: 82, height: 101 },
  ];
  const verdict = classifySplitScreenLayout(boxes, W, H);
  assertEquals(verdict.isSplitScreen, true);
});

Deno.test("v447: a genuine two-shot is not blocked", () => {
  const boxes = [
    { x: 480, y: 250, width: 90, height: 110 },
    { x: 700, y: 300, width: 130, height: 160 },
  ];
  const verdict = classifySplitScreenLayout(boxes, W, H);
  assertEquals(verdict.isSplitScreen, false);
});

Deno.test("v447: preclip signature is fail-closed without run identity", () => {
  const base = {
    plateKey: "https://x/plate.mp4",
    crop: { x: 10, y: 20, size: 300, outputSize: 720 },
    bbox: [10, 20, 100, 120] as [number, number, number, number],
    startSec: 0,
    endSec: 3.5,
  };
  assertEquals(buildPreclipSignature({ ...base, runId: null, generation: 4 }), null);
  assertEquals(buildPreclipSignature({ ...base, runId: "run-a", generation: null }), null);

  const sig = buildPreclipSignature({ ...base, runId: "run-a", generation: 4 });
  assertEquals(typeof sig, "string");
  // Any identity or geometry change yields a different signature.
  const variants = [
    buildPreclipSignature({ ...base, runId: "run-b", generation: 4 }),
    buildPreclipSignature({ ...base, runId: "run-a", generation: 5 }),
    buildPreclipSignature({ ...base, runId: "run-a", generation: 4, plateKey: "https://x/other.mp4" }),
    buildPreclipSignature({
      ...base,
      runId: "run-a",
      generation: 4,
      crop: { x: 11, y: 20, size: 300, outputSize: 720 },
    }),
    buildPreclipSignature({ ...base, runId: "run-a", generation: 4, endSec: 3.6 }),
  ];
  for (const v of variants) {
    assertEquals(v === sig, false);
  }
});
