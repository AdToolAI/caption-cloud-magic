/**
 * face-track.test.ts (v357) — Regression: die Bounding-Box-Spur muss sich
 * tatsächlich bewegen. Eine Standbox über alle Frames darf nie zurückkommen.
 *
 * Run: deno test supabase/functions/_shared/face-track.test.ts
 */

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type Box,
  boxIou,
  pickTrackedBox,
  withContextPadding,
  clampBoxArea,
  MAX_DISPATCH_BOX_AREA_FRAC,
  sampleTimestamps,
  interpolateBoxes,
  trackMovementPx,
  CONTEXT_PAD_X,
} from "./face-track.ts";

/** Flächenanteil einer Box am Bild — die Zahl, an der v372 gemessen wird. */
const areaFrac = (b: Box, w: number, h: number) =>
  ((b[2] - b[0]) * (b[3] - b[1])) / (w * h);


Deno.test("v357: bewegte Keyframes erzeugen eine bewegte Spur, keine Standbox", () => {
  const boxes = interpolateBoxes({
    keyframes: [
      { t: 0, box: [100, 100, 200, 200] },
      { t: 2, box: [300, 140, 400, 240] },
    ],
    frameCount: 60,
    fps: 30,
    voicedWindowsSec: [[0, 2]],
  });
  const nonNull = boxes.filter(Boolean) as Box[];
  assert(nonNull.length > 50, `zu wenige Boxen: ${nonNull.length}`);
  const unique = new Set(nonNull.map((b) => b.join(",")));
  assert(unique.size > 10, `Spur ist faktisch statisch (${unique.size} Positionen)`);
  assert(trackMovementPx(boxes) > 150, "Spur bewegt sich nicht messbar");
});

Deno.test("v357: Frames außerhalb der Voiced-Windows bleiben null", () => {
  const boxes = interpolateBoxes({
    keyframes: [{ t: 1, box: [10, 10, 60, 60] }],
    frameCount: 100,
    fps: 25,
    voicedWindowsSec: [[1, 2]],
    padFrames: 0,
  });
  assertEquals(boxes[0], null);
  assertEquals(boxes[99], null);
  assert(boxes[30] !== null, "Frame innerhalb des Fensters darf nicht null sein");
});

Deno.test("v357: fehlende Voiced-Windows → gesamter Clip, aber keine All-Null-Ausgabe", () => {
  const boxes = interpolateBoxes({
    keyframes: [{ t: 0, box: [10, 10, 60, 60] }],
    frameCount: 24,
    fps: 24,
    voicedWindowsSec: [],
  });
  assertEquals(boxes.length, 24);
  assertEquals(boxes.filter(Boolean).length, 24);
});

Deno.test("v357: Kontextrahmen vergrößert die Box und bleibt im Bild", () => {
  const padded = withContextPadding([100, 100, 200, 200], 640, 640);
  assert(padded[0] < 100 && padded[2] > 200, "seitlicher Kontext fehlt");
  assert(padded[3] - padded[1] > 100, "vertikaler Kontext fehlt");
  assertEquals(padded[0], Math.round(100 - 100 * CONTEXT_PAD_X));

  const clamped = withContextPadding([0, 0, 50, 50], 60, 60);
  assertEquals(clamped[0], 0);
  assertEquals(clamped[1], 0);
  assert(clamped[2] <= 60 && clamped[3] <= 60, "Box läuft aus dem Bild");
});

Deno.test("v357: Tracking bleibt bei derselben Person (kein Sprung auf Nachbargesicht)", () => {
  const reference: Box = [100, 100, 200, 200];
  const neighbour: Box = [600, 100, 700, 200];
  const sameMoved: Box = [130, 105, 230, 205];
  assertEquals(pickTrackedBox([neighbour, sameMoved], reference), sameMoved);
  // Auch ohne Überlappung gewinnt der nähere Kandidat.
  assertEquals(pickTrackedBox([neighbour, [260, 100, 360, 200]], reference), [260, 100, 360, 200]);
  assert(boxIou(reference, sameMoved) > 0);
});

Deno.test("v357: Stützstellen decken den Turn ab und liegen innerhalb der Grenzen", () => {
  const ts = sampleTimestamps(1, 5, 6);
  assert(ts.length >= 2 && ts.length <= 6, `unerwartete Anzahl: ${ts.length}`);
  assert(ts[0] >= 1 && ts[ts.length - 1] <= 5, "Stützstelle außerhalb des Turns");
  for (let i = 1; i < ts.length; i++) assert(ts[i] > ts[i - 1], "nicht monoton");
});
