/**
 * V543-2 — Full-Shot-Zeitbasis (Quell-Vertrag).
 *
 * Der Full-Shot-Dispatch schickt das GANZE Plate-Video an Sync.so. Damit der
 * Provider die Sprecher-Box akzeptiert (`generation_input_face_selection_invalid`
 * war die Ablehnung von Gen 2), müssen Video, Audio und Box-Array EINE
 * Zeitachse teilen und das Box-Array exakt so lang sein wie das Video Frames
 * hat. Diese Tests halten genau diese Invarianten am Quelltext fest.
 */

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const DIALOG = await Deno.readTextFile(
  new URL("../compose-dialog-segments/index.ts", import.meta.url),
);

Deno.test("v543: full-shot requires a MEASURED plate timebase", () => {
  assert(DIALOG.includes("getPlateVideoMetaCached"));
  assert(DIALOG.includes("const v543PlateMeta = v543CandidateEligible"));
  assert(
    DIALOG.includes(
      "const v153UnifiedBboxEligible = v543CandidateEligible &&\n      !!v543PlateMeta &&\n      v543PlateMeta.fps > 0 &&\n      v543PlateMeta.frameCount > 0;",
    ),
    "eligibility must fail closed when fps/frameCount cannot be measured",
  );
});

Deno.test("v543: frame count comes from stts, not from ASSUMED_FPS", () => {
  assert(DIALOG.includes('"v543_stts_frame_count"'));
  assert(
    DIALOG.includes("(v543Meta?.fps && v543Meta.fps > 0 ? v543Meta.fps : ASSUMED_FPS)"),
    "measured fps must take precedence over ASSUMED_FPS in the full-shot path",
  );
});

Deno.test("v543: full-shot audio stays plate-aligned", () => {
  assert(
    DIALOG.includes(
      "const v543FullShotAudio = (pass as any)._v153BboxPrimary === true;",
    ),
  );
  assert(
    DIALOG.includes("!v406SkipRebuild && !v543FullShotAudio;"),
    "tight slicing must be disabled for the full-shot path",
  );
  assert(DIALOG.includes('mode: "skipped_v543_fullshot_plate_aligned"'));
});

Deno.test("v543: the mp4 probe reads the video track, not the movie header", () => {
  assert(DIALOG.includes('if (handler !== "vide") continue;'));
  assert(DIALOG.includes('const stts = stbl ? child(stbl.start, stbl.end, "stts") : null;'));
  // stts sample counts are the authoritative frame count.
  assert(DIALOG.includes("frameCount += dv.getUint32(off);"));
});

Deno.test("v543: preclip path keeps its own (unchanged) timebase", () => {
  assertEquals(DIALOG.includes('"preclip_frame_count"'), true);
  assert(DIALOG.includes("const dispatchFps = v161UsingPreclipForBbox"));
  assert(
    DIALOG.includes('? Number((pass as any).preclip_fps ?? 30)'),
    "preclip fps source must be untouched",
  );
});
