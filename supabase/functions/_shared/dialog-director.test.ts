/**
 * dialog-director.test.ts (v357) — Der Director darf NIE blockieren.
 * Run: deno test supabase/functions/_shared/dialog-director.test.ts
 */

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decideDialogMode, type DirectorFace } from "./dialog-director.ts";

const face = (x: number, w: number): DirectorFace => ({ bbox: [x, 100, x + w, 100 + w] });

Deno.test("v357: große Gesichter → Gruppenshot, kein Extra-Aufwand", () => {
  const d = decideDialogMode({
    faces: [face(0, 300), face(600, 320)],
    plateWidth: 1920, plateHeight: 1080, nativePlateWidth: 1920, expectedSpeakers: 2,
  });
  assertEquals(d.mode, "group_shot");
  assertEquals(d.framingSuffix, "");
  assertEquals(d.punchInZoom, 1);
});

Deno.test("v357: grenzwertige Gesichter → Punch-in mit sinnvollem Zoomfaktor", () => {
  const d = decideDialogMode({
    faces: [face(0, 130), face(400, 160)],
    plateWidth: 1920, plateHeight: 1080, nativePlateWidth: 1920, expectedSpeakers: 2,
  });
  assertEquals(d.mode, "punch_in");
  assert(d.punchInZoom > 1.5 && d.punchInZoom <= 2, `Zoom unplausibel: ${d.punchInZoom}`);
});

Deno.test("v357: Regression 4er-Konferenz (Kailee 94px) → Coverage statt Fehlschlag", () => {
  // Reale Werte aus Szene 89c5e01c: Plate 1928 breit, Gesichter 94–181 px.
  const d = decideDialogMode({
    faces: [face(0, 94), face(300, 173), face(700, 181), face(1200, 120)],
    plateWidth: 1928, plateHeight: 1076, nativePlateWidth: 1928, expectedSpeakers: 4,
  });
  assertEquals(d.mode, "coverage");
  assertEquals(d.minFaceWidthPx, 94);
  assert(d.framingSuffix.includes("CLOSE DIALOGUE SHOT"));
});

Deno.test("v357: kein erkanntes Gesicht → Coverage, niemals ein Abbruch", () => {
  const d = decideDialogMode({
    faces: [], plateWidth: 1920, plateHeight: 1080, nativePlateWidth: 1920, expectedSpeakers: 3,
  });
  assertEquals(d.mode, "coverage");
  assert(d.note.length > 0);
});

Deno.test("v357: Boxen in normalisiertem 1000er-Raum werden auf native px hochgerechnet", () => {
  const d = decideDialogMode({
    faces: [face(0, 60)], // 6 % der Breite
    plateWidth: 1000, plateHeight: 1000, nativePlateWidth: 1920, expectedSpeakers: 1,
  });
  assertEquals(d.minFaceWidthPx, 115); // 60 * 1.92
  assertEquals(d.mode, "punch_in");
});
