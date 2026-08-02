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

// ── v372 — Produktionsfall Szene 6bf4e815, Pass 1 (Samuel Dusatko) ────────
// Belegte Werte aus dem fehlgeschlagenen Lauf:
//   Clip-Space-Anchor  [154,113,561,624]  ≈ 40 % von 720×720  → korrekt
//   nach 2. Aufweitung [52,0,663,720]     ≈ 84.86 %           → Passthrough
// Die drei erfolgreich animierten Sprecher lagen bei 38–41 %.
const SAMUEL_ANCHOR: Box = [154, 113, 561, 624];
const CLIP_W = 720;
const CLIP_H = 720;

Deno.test("v372: Tracking-Fallback weitet die Anchor-Box nicht erneut auf", () => {
  // Der Fallback lässt die Box unangetastet — genau das ist der Fix.
  const before = areaFrac(SAMUEL_ANCHOR, CLIP_W, CLIP_H);
  assert(before > 0.3 && before < 0.5, `Ausgangsfläche unerwartet: ${before}`);

  const { box, clamped } = clampBoxArea(SAMUEL_ANCHOR, CLIP_W, CLIP_H);
  assertEquals(clamped, false, "gültige Gesichtsbox darf nicht geclampt werden");
  assertEquals(box, SAMUEL_ANCHOR);

  // Die alte, fehlerhafte doppelte Aufweitung muss messbar schlechter sein.
  const doublePadded = withContextPadding(SAMUEL_ANCHOR, CLIP_W, CLIP_H);
  assert(
    areaFrac(doublePadded, CLIP_W, CLIP_H) > 0.8,
    "Regressionsannahme falsch: doppeltes Padding erzeugt keine Fast-Vollbildbox",
  );
});

Deno.test("v372: entartete Fast-Vollbildbox wird zurückgeschnitten statt verworfen", () => {
  const degenerate: Box = [52, 0, 663, 720];
  assert(areaFrac(degenerate, CLIP_W, CLIP_H) > 0.8);

  const { box, clamped } = clampBoxArea(degenerate, CLIP_W, CLIP_H);
  assertEquals(clamped, true);
  const after = areaFrac(box, CLIP_W, CLIP_H);
  assert(
    after <= MAX_DISPATCH_BOX_AREA_FRAC + 0.01,
    `Clamp wirkungslos: ${after}`,
  );
  assert(box[2] > box[0] && box[3] > box[1], "Box entartet nach dem Clamp");
  // Innerhalb des Bildes bleiben.
  assert(box[0] >= 0 && box[1] >= 0 && box[2] <= CLIP_W && box[3] <= CLIP_H);
});

Deno.test("v372: getrackt und ungetrackt liefern dieselbe Flächenordnung", () => {
  // Rohe Tracker-Box (ohne Kontext) wird an der Aufrufstelle einmal gepaddet.
  const rawTracked: Box = [230, 200, 480, 520];
  const trackedDispatch = clampBoxArea(
    withContextPadding(rawTracked, CLIP_W, CLIP_H),
    CLIP_W,
    CLIP_H,
  ).box;
  const fallbackDispatch = clampBoxArea(SAMUEL_ANCHOR, CLIP_W, CLIP_H).box;

  const a = areaFrac(trackedDispatch, CLIP_W, CLIP_H);
  const b = areaFrac(fallbackDispatch, CLIP_W, CLIP_H);
  assert(
    Math.abs(a - b) < 0.2,
    `Tracking-Ausfall verändert die Geometrie systematisch: tracked=${a} fallback=${b}`,
  );
  assert(a <= MAX_DISPATCH_BOX_AREA_FRAC + 0.01 && b <= MAX_DISPATCH_BOX_AREA_FRAC + 0.01);
});

