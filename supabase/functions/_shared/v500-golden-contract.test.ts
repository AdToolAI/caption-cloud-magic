import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  goldenFaceShare,
  goldenFaceSizePx,
  goldenMouthHeight,
  V500_GOLDEN_PASSES,
} from "./v500-golden-contract.ts";
import { FACE_MOUTH_Y_RATIO } from "./v456-roi-contract.ts";

/**
 * V500-A — these tests do not assert what v400 SHOULD have been. They pin what
 * the known-good run actually did, so any later engine change can be diffed
 * against reality instead of against prose.
 */

Deno.test("V500-A — the golden run framed on the FACE CENTRE, never on a mouth", () => {
  for (const p of V500_GOLDEN_PASSES) {
    assertEquals(p.anchor, "face_center", `pass ${p.idx}`);
    assertEquals(p.mouthOffsetPx, 0, `pass ${p.idx}`);
    assertEquals(p.plateMouth, null, `pass ${p.idx}`);
    // The crop centre IS the face centre (±1 px rounding).
    const cx = p.crop.x + p.crop.size / 2;
    const cy = p.crop.y + p.crop.size / 2;
    if (Math.abs(cx - p.coords[0]) > 1 || Math.abs(cy - p.coords[1]) > 1) {
      throw new Error(`pass ${p.idx}: crop centre ${cx}/${cy} ≠ face centre ${p.coords}`);
    }
  }
});

Deno.test("V500-A — the golden run had NO camera path (static crop per pass)", () => {
  for (const p of V500_GOLDEN_PASSES) {
    assertEquals(p.cameraPathKeyframes, 0, `pass ${p.idx}`);
  }
});

Deno.test("V500-A — golden mouth height is ~0.57–0.62, not 0.62 by construction", () => {
  const heights = V500_GOLDEN_PASSES.map((p) => goldenMouthHeight(p, FACE_MOUTH_Y_RATIO));
  for (const [i, h] of heights.entries()) {
    if (!(h > 0.55 && h < 0.63)) throw new Error(`pass ${i}: mouth height ${h.toFixed(4)}`);
  }
  // Documented spread of the run that worked.
  const min = Math.min(...heights);
  const max = Math.max(...heights);
  if (!(min > 0.56 && min < 0.58)) throw new Error(`min ${min}`);
  if (!(max > 0.60 && max < 0.62)) throw new Error(`max ${max}`);
});

Deno.test("V500-A — golden run satisfies the T9 invariants (0.24 face share / 144 px)", () => {
  for (const p of V500_GOLDEN_PASSES) {
    const share = goldenFaceShare(p);
    const px = goldenFaceSizePx(p);
    if (!(share >= 0.24)) throw new Error(`pass ${p.idx}: face_share ${share.toFixed(4)}`);
    if (!(px >= 144)) throw new Error(`pass ${p.idx}: face px ${px.toFixed(1)}`);
  }
});

Deno.test("V500-A — T10 golden dispatch shape is one single frozen contract", () => {
  for (const p of V500_GOLDEN_PASSES) {
    assertEquals(p.dispatch.model, "sync-3", `pass ${p.idx}`);
    assertEquals(p.dispatch.retryVariant, "bbox-url-pro", `pass ${p.idx}`);
    assertEquals(p.dispatch.asdMode, "bounding_boxes_url", `pass ${p.idx}`);
    assertEquals(p.dispatch.syncMode, "cut_off", `pass ${p.idx}`);
    assertEquals(p.dispatch.inputSpace, "clip", `pass ${p.idx}`);
    assertEquals(p.dispatch.videoKind, "preclip", `pass ${p.idx}`);
    assertEquals(p.dispatch.optionKeys, ["sync_mode", "active_speaker_detection"], `pass ${p.idx}`);
  }
});

Deno.test("V500-A — all four golden passes succeeded", () => {
  assertEquals(V500_GOLDEN_PASSES.length, 4);
  for (const p of V500_GOLDEN_PASSES) assertEquals(p.outcome, "done", `pass ${p.idx}`);
});
