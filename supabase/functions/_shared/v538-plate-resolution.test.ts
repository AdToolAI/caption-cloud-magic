import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  V538_MIN_SPEAKERS_FOR_HIRES,
  v538PlateResolution,
  v538SpeakerCount,
} from "./v538-plate-resolution.ts";
import { dominantOverTarget } from "./syncso-face-gate.ts";

const base = {
  isLipSyncPlate: true,
  speakerCount: 4,
  tierResolution: "720p",
  hiResToken: "1080p",
  hiResAllowed: true,
};

Deno.test("V538 A — multi-speaker lip-sync plate is raised to the contract raster", () => {
  const d = v538PlateResolution(base);
  assertEquals(d.resolution, "1080p");
  assertEquals(d.upgraded, true);
  assertEquals(d.blockedByProvider, false);
});

Deno.test("V538 A — non lip-sync plate keeps the billing tier raster", () => {
  const d = v538PlateResolution({ ...base, isLipSyncPlate: false });
  assertEquals(d.resolution, "720p");
  assertEquals(d.upgraded, false);
  assertEquals(d.reason, "not_a_lipsync_plate");
});

Deno.test("V538 A — single-speaker plate is untouched (720p keeps working)", () => {
  const d = v538PlateResolution({ ...base, speakerCount: 1 });
  assertEquals(d.resolution, "720p");
  assertEquals(d.upgraded, false);
  assertEquals(V538_MIN_SPEAKERS_FOR_HIRES, 2);
});

Deno.test("V538 A — a provider constraint is reported, never overridden", () => {
  const d = v538PlateResolution({ ...base, tierResolution: "768p", hiResAllowed: false });
  assertEquals(d.resolution, "768p");
  assertEquals(d.upgraded, false);
  assertEquals(d.blockedByProvider, true);
});

Deno.test("V538 A — pro tier already at the contract raster is a no-op", () => {
  const d = v538PlateResolution({ ...base, tierResolution: "1080p" });
  assertEquals(d.resolution, "1080p");
  assertEquals(d.upgraded, false);
  assertEquals(d.reason, "already_at_contract_raster");
});

Deno.test("V538 A — speaker count is distinct character ids", () => {
  assertEquals(
    v538SpeakerCount([{ characterId: "a" }, { characterId: "b" }, { characterId: "a" }]),
    2,
  );
  assertEquals(v538SpeakerCount(null, { characterId: "solo" }), 1);
  assertEquals(v538SpeakerCount([{ characterId: "  " }, null]), 0);
});

Deno.test("V538 C — a smaller extra face does not dominate the target", () => {
  const r = dominantOverTarget(
    [
      { center: [100, 100], bbox: [50, 50, 150, 150] },
      { center: [500, 100], bbox: [490, 90, 510, 110] },
    ],
    [100, 100],
  );
  assertEquals(r.dominated, false);
});

Deno.test("V538 C — a larger competing face still fails closed", () => {
  const r = dominantOverTarget(
    [
      { center: [100, 100], bbox: [90, 90, 110, 110] },
      { center: [500, 100], bbox: [400, 0, 600, 200] },
    ],
    [100, 100],
  );
  assertEquals(r.dominated, true);
});

Deno.test("V538 C — no coord or no boxes never re-introduces a veto", () => {
  assertEquals(dominantOverTarget([{ center: [1, 1] }], null).dominated, false);
  assertEquals(dominantOverTarget([{ center: [1, 1] }], [1, 1]).dominated, false);
  assertEquals(dominantOverTarget([], [1, 1]).dominated, false);
});
