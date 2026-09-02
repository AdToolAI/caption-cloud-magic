/** V544 — v400 preclip authority after the bounded V543 experiment. */

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const DIALOG = await Deno.readTextFile(
  new URL("../compose-dialog-segments/index.ts", import.meta.url),
);

Deno.test("v544: full-shot activation is absent", () => {
  assertEquals(DIALOG.includes("FEATURE_V543_FULLPLATE"), false);
  assertEquals(DIALOG.includes("const v543CandidateEligible"), false);
  assertEquals(DIALOG.includes("const v153UnifiedBboxEligible"), false);
});

Deno.test("v544: stale full-shot markers are cleared", () => {
  assert(DIALOG.includes("delete (pass as any)._v152BboxPrimary;"));
  assert(DIALOG.includes("delete (pass as any)._v153BboxPrimary;"));
  assert(DIALOG.includes("delete (pass as any)._v543PlateMeta;"));
});

Deno.test("v544: preclip dispatch is required for every speaker count", () => {
  assert(DIALOG.includes("const v204MultiSpeakerPreclipDispatch = true;"));
  assert(DIALOG.includes('"v204_preclip_missing_before_wire"'));
  assert(DIALOG.includes('const dispatchVideoKind = usePassPreclip ? "preclip" : "full_plate";'));
});

Deno.test("v543: the mp4 probe reads the video track, not the movie header", () => {
  assert(DIALOG.includes('if (handler !== "vide") continue;'));
  assert(DIALOG.includes('const stts = stbl ? child(stbl.start, stbl.end, "stts") : null;'));
  // stts sample counts are the authoritative frame count.
  assert(DIALOG.includes("frameCount += dv.getUint32(off);"));
});

Deno.test("v544: preclip path uses its exact persisted timebase", () => {
  assertEquals(DIALOG.includes('"preclip_frame_count"'), true);
  assert(DIALOG.includes("const dispatchFps = v161UsingPreclipForBbox"));
  assert(
    DIALOG.includes('? Number((pass as any).preclip_fps ?? 30)'),
    "preclip fps source must be untouched",
  );
  assert(
    DIALOG.includes('if (v161UsingPreclipForBbox && preclipPersistedFrameCount <= 0)'),
    "a preclip without its exact persisted frame count must fail before provider dispatch",
  );
});
