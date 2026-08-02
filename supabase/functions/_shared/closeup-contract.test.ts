/**
 * closeup-contract.test.ts — v356
 *
 * Guards the face-size contract of the lip-sync pipeline:
 *  1. the binding gate is measured in NATIVE PIXELS, not in a ratio,
 *  2. a legitimate 4-person group shot is NOT blocked for being a group
 *     (the v354 regression) as long as it carries enough real pixels,
 *  3. ratios survive only as anchor-stage framing guidance,
 *  4. lip-sync scenes are rendered at the highest available resolution,
 *  5. the preclip carries NO geometric pre-dispatch block (v356) — the
 *     DB-verified 2026-07-27 baseline passed at 128px / 4.8 % share.
 */

import {
  assertEquals,
  assert,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  assertPlateFaceContract,
  closeupFramingSuffix,
  CONTRACT_VIOLATION_UPSTREAM,
  contractFailureMessage,
  lipsyncPlateResolution,
  MIN_FACE_WIDTH_PX,
  requiredFaceWidthRatio,
} from "./lipsync-closeup-contract.ts";
import { enforceMinFaceSize } from "./anchor-min-face-size.ts";

Deno.test("pixel floor matches the measured provider boundary", () => {
  // 181px native crop animated, 116px/102px came back untouched.
  // 120px face width ≈ 180px crop with the standard preclip margin.
  assertEquals(MIN_FACE_WIDTH_PX, 120);
});

Deno.test("contract flags the historical failure geometry (advisory)", () => {
  // Scene 7c11bc27: 4 speakers, 74px faces on a 1284px plate.
  const r = assertPlateFaceContract({
    faces: [
      [0, 0, 74, 96],
      [200, 0, 274, 96],
      [400, 0, 474, 96],
      [600, 0, 674, 96],
    ],
    plateWidth: 1284,
    speakers: 4,
  });
  assertEquals(r.ok, false);
  assertEquals(r.mode, "pixels");
  assertEquals(r.minWidthPx, 74);
  assert(r.reason?.startsWith("face_width_74px_below_120px"));
  assert(contractFailureMessage(r, 4).includes("120 px"));
});

Deno.test("v354 regression: a real 4-person group shot is not blocked", () => {
  // Same composition (faces ~9.4 % of the frame) but rendered at 1920px:
  // 180px of real face detail — well past the provider boundary, and
  // exactly the case v354 rejected on its 16 % ratio bar.
  const r = assertPlateFaceContract({
    faces: [
      [0, 0, 180, 230],
      [400, 0, 580, 230],
      [800, 0, 980, 230],
      [1200, 0, 1380, 230],
    ],
    plateWidth: 1920,
    speakers: 4,
  });
  assertEquals(r.ok, true);
  assert(r.minWidthRatio < requiredFaceWidthRatio(4), "ratio would have failed v354");
});

Deno.test("contract blocks when no face was detected", () => {
  const r = assertPlateFaceContract({ faces: [], plateWidth: 1000, speakers: 1 });
  assertEquals(r.ok, false);
  assertEquals(r.reason, "no_faces_detected");
  assert(contractFailureMessage(r, 1).includes("kein Gesicht"));
});

Deno.test("ratio mode stays available as anchor framing guidance", () => {
  assertEquals(requiredFaceWidthRatio(1), 0.30);
  assertEquals(requiredFaceWidthRatio(2), 0.22);
  assertEquals(requiredFaceWidthRatio(4), 0.16);
  const r = assertPlateFaceContract({
    faces: [[0, 0, 100, 130]],
    plateWidth: 1000,
    speakers: 1,
    mode: "ratio",
  });
  assertEquals(r.ok, false);
  assertEquals(r.mode, "ratio");
  assert(r.reason?.startsWith("face_width_ratio_"));
});

Deno.test("anchor gate keeps steering toward tight framing", () => {
  const gate = enforceMinFaceSize({
    faces: [{ bbox: [0, 0, 140, 180] }],
    plateWidth: 1000,
    plateHeight: 1000,
    expectedSpeakers: 1,
  });
  assertEquals(gate.ok, false, "single-speaker anchor should still want 30 % face width");

  const ok = enforceMinFaceSize({
    faces: [{ bbox: [0, 0, 320, 400] }],
    plateWidth: 1000,
    plateHeight: 1000,
    expectedSpeakers: 1,
  });
  assertEquals(ok.ok, true);
});

Deno.test("lip-sync scenes render at the highest available resolution", () => {
  assertEquals(lipsyncPlateResolution(true, ["720p", "1080p"], "720p"), "1080p");
  assertEquals(lipsyncPlateResolution(true, ["768p", "1080p"], "768p"), "1080p");
  // no lip-sync → the caller's own quality choice is untouched
  assertEquals(lipsyncPlateResolution(false, ["720p", "1080p"], "720p"), "720p");
  // unknown ladder → fall back rather than invent an unsupported value
  assertEquals(lipsyncPlateResolution(true, ["540p"], "540p"), "540p");
});

Deno.test("closeup framing suffix is present for every speaker count", () => {
  for (const n of [1, 2, 3, 4]) {
    const s = closeupFramingSuffix(n);
    assert(s.includes("[LIP-SYNC FRAMING]"));
    assert(s.length > 80);
  }
});

// v356/v396 source-grep contracts removed with the 27.07.2026 lip-sync rollback.
