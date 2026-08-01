/**
 * closeup-contract.test.ts — v354
 *
 * Guards the face-size contract of the lip-sync pipeline:
 *  1. the required ratio is speaker-count aware and never below the
 *     pre-v354 advisory value,
 *  2. `assertPlateFaceContract` blocks (never warns) on small faces,
 *  3. the anchor gate inherits the contract ratios,
 *  4. the preclip thresholds remain in place, but as an ASSERTION that
 *     names the upstream stage.
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
  requiredFaceWidthRatio,
} from "./lipsync-closeup-contract.ts";
import { enforceMinFaceSize } from "./anchor-min-face-size.ts";

Deno.test("required ratio is speaker-count aware", () => {
  assertEquals(requiredFaceWidthRatio(1), 0.30);
  assertEquals(requiredFaceWidthRatio(2), 0.22);
  assertEquals(requiredFaceWidthRatio(3), 0.16);
  assertEquals(requiredFaceWidthRatio(4), 0.16);
  // never below the legacy advisory value
  for (const n of [1, 2, 3, 4, 8]) {
    assert(requiredFaceWidthRatio(n) >= 0.12);
  }
});

Deno.test("contract blocks the historical failure geometry", () => {
  // Scene 69d56a49: 4 speakers, faces ~3 % of plate width.
  const r = assertPlateFaceContract({
    faces: [
      [0, 0, 30, 40],
      [100, 0, 130, 40],
      [200, 0, 230, 40],
      [300, 0, 330, 40],
    ],
    plateWidth: 1000,
    speakers: 4,
  });
  assertEquals(r.ok, false);
  assert(r.minWidthRatio < 0.05);
  assert(r.reason?.startsWith("face_width_ratio_"));
});

Deno.test("contract passes a conforming tight grid", () => {
  const r = assertPlateFaceContract({
    faces: [
      [0, 0, 180, 220],
      [400, 0, 580, 220],
      [0, 400, 180, 620],
    ],
    plateWidth: 1000,
    speakers: 3,
  });
  assertEquals(r.ok, true);
  assertEquals(r.requiredRatio, 0.16);
});

Deno.test("contract blocks when no face was detected", () => {
  const r = assertPlateFaceContract({ faces: [], plateWidth: 1000, speakers: 1 });
  assertEquals(r.ok, false);
  assertEquals(r.reason, "no_faces_detected");
  assert(contractFailureMessage(r, 1).includes("kein Gesicht"));
});

Deno.test("anchor gate inherits the contract ratios", () => {
  // 14 % face width used to pass the old advisory 12 % gate.
  const gate = enforceMinFaceSize({
    faces: [{ bbox: [0, 0, 140, 180] }],
    plateWidth: 1000,
    plateHeight: 1000,
    expectedSpeakers: 1,
  });
  assertEquals(gate.ok, false, "single-speaker anchor must require 30 % face width");

  const ok = enforceMinFaceSize({
    faces: [{ bbox: [0, 0, 320, 400] }],
    plateWidth: 1000,
    plateHeight: 1000,
    expectedSpeakers: 1,
  });
  assertEquals(ok.ok, true);
});

Deno.test("closeup framing suffix is present for every speaker count", () => {
  for (const n of [1, 2, 3, 4]) {
    const s = closeupFramingSuffix(n);
    assert(s.includes("[LIP-SYNC FRAMING]"));
    assert(s.length > 80);
  }
});

Deno.test("preclip keeps its thresholds and names the upstream cause", async () => {
  const src = await Deno.readTextFile(
    new URL("./pass-face-preclip.ts", import.meta.url),
  );
  assert(src.includes("MIN_NATIVE_CROP_PX = 144"), "native crop floor must stay at 144px");
  assert(src.includes("FACE_SIDE_SHARE_FLOOR = 0.34"), "side-share floor must stay at 0.34");
  assert(
    src.includes(CONTRACT_VIOLATION_UPSTREAM),
    "preclip failures must be reported as an upstream contract violation",
  );
});
