import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveTrackMouthAuthority } from "./v477-mouth-authority.ts";

// Real S01 track shape (6 samples per pass, mouth measured in every sample).
const S01_PASS = [
  { t: 0.0, box: [260, 195, 340, 317], mouth: [300, 288] },
  { t: 0.5, box: [262, 196, 342, 318], mouth: [302, 290] },
  { t: 1.0, box: [261, 195, 341, 317], mouth: [301, 289] },
  { t: 1.5, box: [263, 197, 343, 319], mouth: [303, 291] },
  { t: 2.0, box: [260, 195, 340, 317], mouth: [300, 289] },
  { t: 2.5, box: [262, 196, 342, 318], mouth: [302, 290] },
];

Deno.test("V477 — measured landmarks become the authority", () => {
  const a = resolveTrackMouthAuthority(S01_PASS);
  assertEquals(a.reason, "v477_track_landmark");
  assertEquals(a.measured, 6);
  assertEquals(a.total, 6);
  assertEquals(a.mouth, [301, 289]);
  // V476 measured 0.734–0.781 of the face box — never the compensatory 0.88.
  if (!(a.faceRatio! > 0.70 && a.faceRatio! < 0.82)) {
    throw new Error(`unexpected face ratio ${a.faceRatio}`);
  }
});

Deno.test("V477 — a single mis-detected frame cannot move the anchor", () => {
  const poisoned = [...S01_PASS];
  poisoned[3] = { ...poisoned[3], mouth: [900, 20] };
  const a = resolveTrackMouthAuthority(poisoned);
  assertEquals(a.mouth, [301, 289]);
});

Deno.test("V477 — no measurement never guesses (pose fallback stays owner)", () => {
  assertEquals(resolveTrackMouthAuthority(null).mouth, null);
  assertEquals(resolveTrackMouthAuthority(null).reason, "v477_no_track");
  const noMouth = resolveTrackMouthAuthority(
    S01_PASS.map((s) => ({ ...s, mouth: null })),
  );
  assertEquals(noMouth.mouth, null);
  assertEquals(noMouth.reason, "v477_no_mouth_landmark");
  assertEquals(noMouth.total, 6);
});

Deno.test("V477 — partial tracks still yield an authority", () => {
  const partial = S01_PASS.map((s, i) => (i % 2 === 0 ? s : { ...s, mouth: null }));
  const a = resolveTrackMouthAuthority(partial);
  assertEquals(a.measured, 3);
  assertEquals(a.mouth, [301, 289]);
});
