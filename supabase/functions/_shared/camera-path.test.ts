/**
 * camera-path.test.ts (v359) — Der Kamerapfad muss dem Gesicht folgen,
 * ruhig bleiben und nie springen.
 *
 * Der wichtigste Test ist `Kailee-Regression`: ein Gesicht, das während des
 * Turns quer durchs Bild wandert, muss im gerenderten Ausschnitt bleiben.
 * Mit dem statischen Crop aus v358 verlässt es ihn — genau das war der
 * bewiesene Passthrough-Fehler.
 *
 * Run: deno test supabase/functions/_shared/camera-path.test.ts
 */

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type Box,
  buildSpeechWeights,
  fillShortGaps,
  forwardBackwardSmooth,
  HANDLE_WEIGHT,
  MAX_ALLOWED_JUMP,
  medianFilter,
  planCameraPath,
  planConstantZoom,
  transformBoxesToCropSpace,
} from "./camera-path.ts";

/** Erzeugt eine Spur, in der das Gesicht linear von links nach rechts wandert. */
function movingTrack(frames: number, from: [number, number], to: [number, number], side = 130): Array<Box | null> {
  const out: Array<Box | null> = [];
  for (let i = 0; i < frames; i++) {
    const f = frames > 1 ? i / (frames - 1) : 0;
    const cx = from[0] + (to[0] - from[0]) * f;
    const cy = from[1] + (to[1] - from[1]) * f;
    out.push([cx - side / 2, cy - side / 2, cx + side / 2, cy + side / 2]);
  }
  return out;
}

Deno.test("v359 Kailee-Regression: wanderndes Gesicht bleibt im bewegten Crop", () => {
  // 2,28 s @ 30 fps ≈ 69 Frames. Das Gesicht wandert über ~700 px.
  const frames = 69;
  const boxes = movingTrack(frames, [420, 430], [1120, 470], 128);
  const weights = buildSpeechWeights({ frameCount: frames, fps: 30, voicedWindowsSec: [[0.2, 2.08]] });

  const res = planCameraPath({
    boxes,
    plateWidth: 1928,
    plateHeight: 1076,
    weights,
    minSize: 128,
  });

  assert(res.moving, "Kamera steht still, obwohl sich das Gesicht bewegt");
  assert(
    res.weightedContainedRatio >= 0.98,
    `Gesicht verlässt den Ausschnitt: gewichtete Abdeckung ${res.weightedContainedRatio.toFixed(3)}`,
  );

  // Gegenprobe: derselbe Track mit FESTEM Crop (v358-Verhalten) scheitert.
  const staticWin = { x: res.path[0].x, y: res.path[0].y, size: res.size };
  let staticContained = 0;
  for (const b of boxes) {
    if (!b) continue;
    if (
      b[0] >= staticWin.x && b[1] >= staticWin.y &&
      b[2] <= staticWin.x + staticWin.size && b[3] <= staticWin.y + staticWin.size
    ) staticContained++;
  }
  const staticRatio = staticContained / frames;
  assert(
    staticRatio < 0.6,
    `statischer Crop hätte hier funktioniert (${staticRatio.toFixed(2)}) — Test bildet den Fehlerfall nicht ab`,
  );
});

Deno.test("v359: keine Ein-Frame-Sprünge über der Grenze", () => {
  const boxes = movingTrack(60, [300, 300], [900, 600]);
  const res = planCameraPath({ boxes, plateWidth: 1280, plateHeight: 720, minSize: 128 });
  assert(
    res.maxJump <= MAX_ALLOWED_JUMP,
    `Kamerasprung zu groß: ${res.maxJump.toFixed(4)} > ${MAX_ALLOWED_JUMP}`,
  );
});

Deno.test("v359: ruhiges Gesicht erzeugt (fast) keine Kamerabewegung — Dead Zone greift", () => {
  const boxes: Array<Box | null> = [];
  for (let i = 0; i < 60; i++) {
    // Mikrobewegung von wenigen Pixeln, wie sie jeder Detektor produziert.
    const jitter = Math.sin(i / 3) * 2;
    boxes.push([500 + jitter, 300 + jitter, 630 + jitter, 430 + jitter]);
  }
  const res = planCameraPath({ boxes, plateWidth: 1280, plateHeight: 720, minSize: 128 });
  const xs = new Set(res.path.map((p) => p.x));
  assert(xs.size <= 3, `Kamera zittert dem Detektor hinterher (${xs.size} Positionen)`);
});

Deno.test("v359: Zoom ist über den gesamten Turn konstant", () => {
  const boxes = movingTrack(50, [300, 300], [800, 400]);
  const res = planCameraPath({ boxes, plateWidth: 1280, plateHeight: 720, minSize: 128 });
  const sizes = new Set(res.path.map((p) => p.size));
  assertEquals(sizes.size, 1, "Crop-Größe ändert sich pro Frame (Zoom-Pumping)");
});

Deno.test("v359: kurze Lücken werden interpoliert, lange nicht", () => {
  const boxes: Array<Box | null> = movingTrack(30, [100, 100], [400, 100]);
  boxes[10] = null;
  boxes[11] = null; // kurze Lücke → füllen
  for (let i = 18; i < 26; i++) boxes[i] = null; // lange Lücke → nicht raten

  const filled = fillShortGaps(boxes);
  assert(filled.boxes[10] !== null, "kurze Lücke wurde nicht geschlossen");
  assertEquals(filled.boxes[20], null, "über eine lange Lücke wurde geraten");
  assert(filled.reacquisitionFrames.includes(26), "Reacquisition wurde nicht markiert");
  assertEquals(filled.maxGapFrames, 8);
});

Deno.test("v359: Sprachframes werden höher gewichtet als Handles", () => {
  const w = buildSpeechWeights({
    frameCount: 60,
    fps: 30,
    voicedWindowsSec: [[0.5, 1.5]],
    handleSec: 0.2,
  });
  assertEquals(w.length, 60);
  assertEquals(w[0], HANDLE_WEIGHT);
  assertEquals(w[30], 1);
  assert(w[30] > w[0], "Sprachkern ist nicht höher gewichtet");
});

Deno.test("v359: Zoom deckt die sprachgewichteten Frames ab", () => {
  // Großes Gesicht nur im Handle, kleines im Sprachkern: die Crop-Größe
  // darf nicht vom irrelevanten Handle-Frame diktiert werden.
  const boxes: Array<Box | null> = [];
  for (let i = 0; i < 40; i++) {
    const side = i < 5 ? 400 : 120;
    boxes.push([300, 300, 300 + side, 300 + side]);
  }
  const weights = buildSpeechWeights({ frameCount: 40, fps: 30, voicedWindowsSec: [[0.3, 1.3]] });
  const { size } = planConstantZoom({
    boxes,
    weights,
    plateWidth: 1280,
    plateHeight: 720,
    minSize: 96,
  });
  assert(size < 400, `Handle-Frame diktiert den Zoom (size=${size})`);
});

Deno.test("v359: Boxen werden gegen das an DIESEM Frame gültige Fenster gerechnet", () => {
  const boxes: Array<Box | null> = [
    [100, 100, 200, 200],
    [300, 100, 400, 200],
  ];
  const path = [
    { x: 50, y: 50, size: 360 },
    { x: 250, y: 50, size: 360 },
  ];
  const res = transformBoxesToCropSpace({ boxes, path, outputSize: 720 });

  assertEquals(res.invalidFrames.length, 0);
  assertEquals(res.boxes.length, 2);
  // Beide Boxen liegen relativ gleich im jeweiligen Fenster — das ist der
  // Beweis, dass mitgezogen wird statt gegen ein festes Fenster zu rechnen.
  assertEquals(res.boxes[0], res.boxes[1]);
  for (const b of res.boxes) {
    assert(b, "Box fehlt");
    assert(b![0] >= 0 && b![1] >= 0 && b![2] <= 720 && b![3] <= 720, "Box außerhalb 0..720");
    assert(b![2] > b![0] && b![3] > b![1], "degenerierte Box");
  }
});

Deno.test("v359: Box außerhalb des Ausschnitts wird null, nicht zusammengedrückt", () => {
  const res = transformBoxesToCropSpace({
    boxes: [[1000, 1000, 1100, 1100]],
    path: [{ x: 0, y: 0, size: 300 }],
    outputSize: 720,
  });
  assertEquals(res.boxes[0], null);
  assertEquals(res.invalidFrames, [0]);
  assertEquals(res.validFrames, 0);
});

Deno.test("v359: Vorwärts-/Rückwärtsglättung läuft der Bewegung nicht hinterher", () => {
  const ramp = Array.from({ length: 40 }, (_, i) => i * 10);
  const sm = forwardBackwardSmooth(ramp);
  // Ein reiner Vorwärts-EMA läge in der Mitte deutlich unter dem Sollwert.
  const mid = Math.floor(ramp.length / 2);
  assert(
    Math.abs(sm[mid] - ramp[mid]) < 12,
    `Phasenverschiebung zu groß: ${sm[mid].toFixed(1)} statt ${ramp[mid]}`,
  );
});

Deno.test("v359: Median-Filter entfernt Einzelausreißer", () => {
  const vals = [10, 10, 10, 900, 10, 10, 10];
  const out = medianFilter(vals, 5);
  assert(out[3] < 100, `Ausreißer überlebt: ${out[3]}`);
});

Deno.test("v359: Pfad bleibt vollständig innerhalb der Plate", () => {
  const boxes = movingTrack(40, [60, 60], [1220, 660], 140);
  const res = planCameraPath({ boxes, plateWidth: 1280, plateHeight: 720, minSize: 128 });
  for (const p of res.path) {
    assert(p.x >= 0 && p.y >= 0, "negativer Ursprung");
    assert(p.x + p.size <= 1280, "Crop läuft rechts aus der Plate");
    assert(p.y + p.size <= 720, "Crop läuft unten aus der Plate");
  }
});

Deno.test("v359: Pfadlänge entspricht immer der Framezahl", () => {
  for (const n of [1, 7, 69, 150]) {
    const res = planCameraPath({
      boxes: movingTrack(n, [200, 200], [400, 300]),
      plateWidth: 1280,
      plateHeight: 720,
      minSize: 128,
    });
    assertEquals(res.path.length, n, `Pfadlänge ${res.path.length} ≠ ${n}`);
  }
});
