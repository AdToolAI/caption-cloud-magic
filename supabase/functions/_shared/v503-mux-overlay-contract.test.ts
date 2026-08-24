import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { resolveMuxOverlayContract } from "./v503-mux-overlay-contract.ts";

Deno.test("V503 — valid persisted crop remains authoritative when legacy coords are outside", () => {
  const result = resolveMuxOverlayContract({
    preclipCrop: { x: 203, y: 157, size: 187 },
    legacyCoords: [177, 272],
  });

  assertEquals(result.crop, { x: 203, y: 157, size: 187 });
  assertEquals(result.legacyCoordsInsideCrop, false);
});

Deno.test("V503 — valid persisted crop reports consistent legacy coords", () => {
  const result = resolveMuxOverlayContract({
    preclipCrop: { x: 203, y: 157, size: 187 },
    legacyCoords: [297, 251],
  });

  assertEquals(result.crop, { x: 203, y: 157, size: 187 });
  assertEquals(result.legacyCoordsInsideCrop, true);
});

Deno.test("V503 — missing or invalid crop remains unavailable to the mux", () => {
  assertEquals(resolveMuxOverlayContract({ preclipCrop: null }).crop, null);
  assertEquals(
    resolveMuxOverlayContract({ preclipCrop: { x: 203, y: 157, size: 0 } }).crop,
    null,
  );
});
