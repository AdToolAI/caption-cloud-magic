/**
 * Deno tests for the v393 preclip mouth geometry check.
 * Belegte Werte stammen aus Szene 9eded574 (720x720 Preclips).
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { measurePreclipMouth } from "./preclip-mouth-geometry.ts";

const clip = { width: 720, height: 720 };

Deno.test("v393: centered face with mouth landmarks passes", () => {
  const r = measurePreclipMouth({
    ...clip,
    faces: [
      {
        bbox: [200, 140, 520, 560],
        center: [360, 350],
        landmarks: { mouthLeft: [320, 470], mouthRight: [400, 472] },
      },
    ],
  });
  assertEquals(r.code, "ok");
  assert(r.mouthCenter && Math.abs(r.mouthCenter[1] - 471) <= 1);
  assert(r.mouthRect && r.controlRect, "measurement windows must be present");
  assert(r.derived === false, "landmark mouth must not be flagged as derived");
});

Deno.test("v393: mouth cut off below the clip is rejected before dispatch", () => {
  // Der belegte Fall: Crop endete auf Mundhoehe, Mund lag unterhalb.
  const r = measurePreclipMouth({
    ...clip,
    faces: [
      {
        bbox: [120, 40, 600, 700],
        center: [360, 370],
        landmarks: { mouthLeft: [320, 745], mouthRight: [400, 748] },
      },
    ],
  });
  assertEquals(r.code, "mouth_missing");
  assert(!r.ok);
});

Deno.test("v393: mouth glued to the lower edge is rejected", () => {
  const r = measurePreclipMouth({
    ...clip,
    faces: [
      {
        bbox: [180, 60, 540, 700],
        center: [360, 380],
        landmarks: { mouthLeft: [320, 706], mouthRight: [400, 708] },
      },
    ],
  });
  assertEquals(r.code, "mouth_at_edge");
  assert(!r.ok);
});

Deno.test("v393: without landmarks the mouth is derived from the bbox", () => {
  const r = measurePreclipMouth({
    ...clip,
    faces: [{ bbox: [200, 140, 520, 560], center: [360, 350] }],
  });
  assertEquals(r.code, "ok");
  assert(r.derived === true);
  assert(r.mouthCenter && r.mouthCenter[1] === Math.round(140 + 420 * 0.72));
});

Deno.test("v393: no face is a hard verdict", () => {
  const r = measurePreclipMouth({ ...clip, faces: [] });
  assertEquals(r.code, "no_face");
});
