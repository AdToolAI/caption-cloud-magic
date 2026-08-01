/**
 * v356 — Regression guard for the lip-sync dispatch policy.
 *
 * Two invariants are locked here.
 *
 *  1. No NOOP retry ladder. Re-dispatching with a different ASD shape but
 *     the SAME input produced the identical passthrough (outVsIn 2.26 →
 *     2.64) and only burned a provider slot + credits.
 *
 *  2. NO geometric pre-dispatch block. Verified against the working
 *     baseline in the database (2026-07-27):
 *
 *       scene 0f8818ee — 4 speakers, dialog_shots.status = "done"
 *         pass 0  crop 128px → 720p  face-share  4.8 %
 *         pass 1  crop 128px → 720p  face-share  8.5 %
 *         pass 2  crop 128px → 720p  face-share 17.4 %
 *         pass 3  crop 128px → 720p  face-share 12.9 %
 *
 *     The v344.1 side-share floor (0.34) and the v353 native-crop floor
 *     (144px) would each have rejected every one of those PASSING passes.
 *     They must never come back. The binding guard is the post-run
 *     `mouth-motion-verdict`, which measures the actual provider output.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const webhookSrc = await Deno.readTextFile(
  new URL("../sync-so-webhook/index.ts", import.meta.url),
);
const preclipSrc = await Deno.readTextFile(
  new URL("./pass-face-preclip.ts", import.meta.url),
);
const dialogSrc = await Deno.readTextFile(
  new URL("../compose-dialog-segments/index.ts", import.meta.url),
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

Deno.test("v356 — no native crop-size floor blocks a dispatch", () => {
  assert(
    !/MIN_NATIVE_CROP_PX/.test(preclipSrc),
    "the 144px native crop floor rejected the working 128px July baseline",
  );
  assert(
    !/plate_face_too_small_for_lipsync/.test(preclipSrc),
    "crop-size pre-block must not be reinstated",
  );
});

Deno.test("v356 — no face-share floor blocks a dispatch", () => {
  assert(
    !/FACE_SIDE_SHARE_FLOOR/.test(preclipSrc),
    "the 0.34 side-share floor rejected the working 4.8 % July baseline",
  );
  assert(
    !/preclip_face_share_too_low/.test(preclipSrc),
    "face-share pre-block must not be reinstated",
  );
});

Deno.test("v356 — preclip geometry is logged, not enforced", () => {
  assert(
    /v356_geometry_telemetry/.test(preclipSrc),
    "geometry must still be measured for diagnosis",
  );
  assert(
    /minSize:\s*128/.test(preclipSrc),
    "minSize must match the DB-verified 2026-07-27 baseline (128px)",
  );
});

Deno.test("v356 — the plate contract no longer fails a scene", () => {
  assert(
    /v356_plate_geometry_telemetry/.test(dialogSrc),
    "plate geometry must still be logged",
  );
  assert(
    !/lipsync_face_contract_violation/.test(dialogSrc),
    "the plate contract must not abort a scene before dispatch",
  );
});

Deno.test("passthrough and static are reported as distinct causes", () => {
  assert(/MOUTH PASSTHROUGH/.test(webhookSrc));
  assert(/MOUTH STATIC/.test(webhookSrc));
});
