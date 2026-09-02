/** V545 — Full-Plate primary for fresh multi-speaker dispatches. */

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const DIALOG = await Deno.readTextFile(
  new URL("../compose-dialog-segments/index.ts", import.meta.url),
);

Deno.test("v545: fresh N>=2 dispatch selects Full-Plate only with locked box and measured timebase", () => {
  assert(DIALOG.includes("const v545FullPlateCandidate ="));
  assert(DIALOG.includes("speakers.length >= 2"));
  assert(DIALOG.includes("const v545PlateMeta = v545FullPlateCandidate"));
  assert(DIALOG.includes("const v545FullPlatePrimary = v545FullPlateCandidate"));
  assert(DIALOG.includes("v545PlateMeta.frameCount > 0"));
});

Deno.test("v545: stale markers are cleared before deterministic path selection", () => {
  assert(DIALOG.includes("delete (pass as any)._v152BboxPrimary;"));
  assert(DIALOG.includes("delete (pass as any)._v153BboxPrimary;"));
  assert(DIALOG.includes("delete (pass as any)._v543PlateMeta;"));
  assert(DIALOG.includes("(pass as any)._v153BboxPrimary = true;"));
  assert(DIALOG.includes("(pass as any)._v543PlateMeta = v545PlateMeta;"));
});

Deno.test("v545: preclip remains fallback when Full-Plate was not selected", () => {
  assert(DIALOG.includes("const v204MultiSpeakerPreclipDispatch = !(pass as any)._v153BboxPrimary;"));
  assert(DIALOG.includes('"v204_preclip_missing_before_wire"'));
  assert(DIALOG.includes('const dispatchVideoKind = usePassPreclip ? "preclip" : "full_plate";'));
  assert(DIALOG.includes('? passInputUrl'));
});

Deno.test("v543: the mp4 probe reads the video track, not the movie header", () => {
  assert(DIALOG.includes('if (handler !== "vide") continue;'));
  assert(DIALOG.includes('const stts = stbl ? child(stbl.start, stbl.end, "stts") : null;'));
  // stts sample counts are the authoritative frame count.
  assert(DIALOG.includes("frameCount += dv.getUint32(off);"));
});

Deno.test("v545: both dispatch paths use exact persisted or measured timebases", () => {
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
  assert(DIALOG.includes('? "v543_stts_frame_count"'));
});
