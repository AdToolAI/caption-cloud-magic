/**
 * v353 — Regression guard for the lip-sync NOOP policy.
 *
 * Two invariants are locked here, both derived from the measurement on
 * scene 7c11bc27 (2026-08-01, 4 speakers):
 *
 *  1. No NOOP retry ladder. Re-dispatching with a different ASD shape but the
 *     SAME input produced the identical passthrough (outVsIn 2.26 → 2.64) and
 *     only burned a provider slot + credits.
 *  2. A native-source floor before dispatch. crop 181px → "moved",
 *     crop 116px / 102px → passthrough. Below 144px we never dispatch.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const webhookSrc = await Deno.readTextFile(
  new URL("../sync-so-webhook/index.ts", import.meta.url),
);
const preclipSrc = await Deno.readTextFile(
  new URL("./pass-face-preclip.ts", import.meta.url),
);

Deno.test("NOOP ladder has no rungs — a proven passthrough is terminal", () => {
  const match = webhookSrc.match(
    /const NOOP_LADDER:[^=]+=\s*(\[[\s\S]*?\]);/,
  );
  assert(match, "NOOP_LADDER declaration not found");
  assertEquals(match![1].replace(/\s/g, ""), "[]");
});

Deno.test("no automatic re-dispatch variant is wired into the NOOP path", () => {
  assert(
    !/nextRung\s*=\s*NOOP_LADDER\.find/.test(webhookSrc),
    "ladder lookup must not be reinstated",
  );
  assert(
    /const canEscalate = false/.test(webhookSrc),
    "escalation must be hard-disabled",
  );
});

Deno.test("native-source crop floor blocks before dispatch", () => {
  const match = preclipSrc.match(/const MIN_NATIVE_CROP_PX\s*=\s*(\d+)/);
  assert(match, "MIN_NATIVE_CROP_PX not found");
  const floor = Number(match![1]);
  // Must reject the measured passthrough crops (116, 102) and accept the
  // measured working crop (181).
  assert(floor > 116, `floor ${floor} would still dispatch a 116px crop`);
  assert(floor <= 181, `floor ${floor} would block the working 181px crop`);
  assert(
    /plate_face_too_small_for_lipsync/.test(preclipSrc),
    "block must return an actionable error code",
  );
});

Deno.test("passthrough and static are reported as distinct causes", () => {
  assert(/MOUTH PASSTHROUGH/.test(webhookSrc));
  assert(/MOUTH STATIC/.test(webhookSrc));
});
