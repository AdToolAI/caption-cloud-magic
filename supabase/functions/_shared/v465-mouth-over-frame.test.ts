import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  classifyMouthOverFrame,
  computeMouthOverFrame,
  V465_MOVED_ABOVE,
  V465_NOOP_BELOW,
  type DecodedStill,
} from "./v465-mouth-over-frame.ts";
import { resolveArtifactAttempt, variantArtifactKey, isImmutableArtifactKey } from "./v434-immutable-artifact.ts";

const W = 32, H = 32;

function still(fill: number, box?: { x: number; y: number; w: number; h: number; v: number }): DecodedStill {
  const data = new Uint8Array(W * H * 4).fill(fill);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  if (box) {
    for (let y = box.y; y < box.y + box.h; y++) {
      for (let x = box.x; x < box.x + box.w; x++) {
        const o = (y * W + x) * 4;
        data[o] = data[o + 1] = data[o + 2] = box.v;
      }
    }
  }
  return { width: W, height: H, data };
}

const ROI = { bx: 8, by: 16, bw: 8, bh: 4 };

Deno.test("passthrough → ratio ≈ 1 → noop", () => {
  const a = [still(100), still(102), still(101)];
  const b = [still(101), still(103), still(102)]; // uniform codec-like shift
  const r = computeMouthOverFrame({ preclipStills: a, providerStills: b, preclipRoi: ROI, providerRoi: ROI });
  assertEquals(r.reason, "measured");
  assert(Math.abs((r.mouth_over_frame ?? 0) - 1) < 0.01, String(r.mouth_over_frame));
  assertEquals(r.classification, "noop");
});

Deno.test("mouth-only change → high ratio → moved", () => {
  const a = [still(100), still(100)];
  const b = [still(100, { x: 8, y: 16, w: 8, h: 4, v: 180 }), still(100, { x: 8, y: 16, w: 8, h: 4, v: 40 })];
  const r = computeMouthOverFrame({ preclipStills: a, providerStills: b, preclipRoi: ROI, providerRoi: ROI });
  assert((r.mouth_over_frame ?? 0) > V465_MOVED_ABOVE, String(r.mouth_over_frame));
  assertEquals(r.classification, "moved");
});

Deno.test("incongruent ROI / dims never guess", () => {
  const a = [still(100)];
  const b = [still(100)];
  assertEquals(
    computeMouthOverFrame({ preclipStills: a, providerStills: b, preclipRoi: ROI, providerRoi: { ...ROI, bw: 9 } })
      .classification,
    "unavailable",
  );
  assertEquals(computeMouthOverFrame({ preclipStills: [], providerStills: b, preclipRoi: ROI, providerRoi: ROI }).reason, "v465_unavailable:no_stills");
});

Deno.test("band is conservative — grey zone is never MOVED", () => {
  assertEquals(classifyMouthOverFrame(V465_NOOP_BELOW - 0.01), "noop");
  assertEquals(classifyMouthOverFrame(V465_NOOP_BELOW), "indeterminate");
  assertEquals(classifyMouthOverFrame(V465_MOVED_ABOVE), "indeterminate");
  assertEquals(classifyMouthOverFrame(V465_MOVED_ABOVE + 0.01), "moved");
  assertEquals(classifyMouthOverFrame(null), "unavailable");
  assertEquals(classifyMouthOverFrame(Number.NaN), "unavailable");
});

Deno.test("V465-B2a — attempt qualifier survives the NOOP ladder", () => {
  assertEquals(resolveArtifactAttempt({ attempt: 0 }), 0);
  assertEquals(resolveArtifactAttempt({ attempt: 0, noop_attempts: 3 }), 3);
  assertEquals(resolveArtifactAttempt({ attempts: [{}, {}, {}] }), 2);
  assertEquals(resolveArtifactAttempt(null), 0);
});

Deno.test("V465-B2a — variant key stays an immutable key", () => {
  const key = "u/v434/s/run-r/gen-1/pass-2/provider-output-a0.mp4";
  assert(isImmutableArtifactKey(key));
  const v = variantArtifactKey(key, "deadbeefcafe");
  assertEquals(v, "u/v434/s/run-r/gen-1/pass-2/provider-output-a0-deadbeef.mp4");
  assert(isImmutableArtifactKey(v));
});
