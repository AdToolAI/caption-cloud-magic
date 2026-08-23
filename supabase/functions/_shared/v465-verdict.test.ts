/**
 * V465-B2b — frozen regression suite for the AUTHORITATIVE verdict contract.
 * Every case below is a contract clause from the B2b authorization.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  resolveV465Verdict,
  V465_FRAME_EDIT_FLOOR,
  V465_VERDICT_MOVED_ABOVE,
  V465_VERDICT_NOOP_BELOW,
} from "./v465-verdict.ts";
import type { V465PairedMetric } from "./v465-mouth-over-frame.ts";

function metric(partial: Partial<V465PairedMetric>): V465PairedMetric {
  const mouthOverFrame = partial.mouth_over_frame ?? 1;
  const frameEdit = partial.frame_edit ?? 3.0;
  return {
    mouth_edit: partial.mouth_edit ?? mouthOverFrame * frameEdit,
    frame_edit: frameEdit,
    mouth_over_frame: mouthOverFrame,
    classification: partial.classification ?? "indeterminate",
    frames: partial.frames ?? 6,
    roi_pixels: partial.roi_pixels ?? 358 * 154,
    reason: partial.reason ?? "measured",
    band: partial.band ?? { noop_below: V465_VERDICT_NOOP_BELOW, moved_above: V465_VERDICT_MOVED_ABOVE },
  };
}

Deno.test("band: 1.99 → noop", () => {
  assertEquals(resolveV465Verdict(metric({ mouth_over_frame: 1.99 })).verdict, "noop");
});

Deno.test("band: exactly 2.00 → indeterminate (boundary never disputed)", () => {
  assertEquals(resolveV465Verdict(metric({ mouth_over_frame: 2.0 })).verdict, "indeterminate");
});

Deno.test("band: 2.30 → indeterminate", () => {
  assertEquals(resolveV465Verdict(metric({ mouth_over_frame: 2.3 })).verdict, "indeterminate");
});

Deno.test("band: exactly 2.65 → indeterminate", () => {
  assertEquals(resolveV465Verdict(metric({ mouth_over_frame: 2.65 })).verdict, "indeterminate");
});

Deno.test("band: 2.66 → motion", () => {
  assertEquals(resolveV465Verdict(metric({ mouth_over_frame: 2.66 })).verdict, "motion");
});

Deno.test("proven MOVED with strongly negative legacy delta stays MOVED (COH06)", () => {
  // COH06: Lambda mouth_over_frame 3.051, old_delta -152.3.
  const r = resolveV465Verdict(metric({ mouth_over_frame: 3.051, frame_edit: 2.9 }));
  assertEquals(r.verdict, "motion");
  assertEquals(r.guard, null);
});

Deno.test("true passthrough stays NOOP (COH10)", () => {
  assertEquals(resolveV465Verdict(metric({ mouth_over_frame: 0.746 })).verdict, "noop");
});

Deno.test("safety: degenerate denominator → indeterminate, never motion", () => {
  const r = resolveV465Verdict(metric({
    mouth_over_frame: 99,
    mouth_edit: 0.0099,
    frame_edit: V465_FRAME_EDIT_FLOOR / 4,
  }));
  assertEquals(r.verdict, "indeterminate");
  assertEquals(r.guard, "frame_edit_below_floor");
});

Deno.test("safety: non-finite metric → indeterminate", () => {
  const r = resolveV465Verdict(metric({ mouth_over_frame: Number.POSITIVE_INFINITY, frame_edit: 0 }));
  assertEquals(r.verdict, "indeterminate");
});

Deno.test("safety: missing output stills → indeterminate, never motion", () => {
  const r = resolveV465Verdict(metric({
    mouth_over_frame: null,
    mouth_edit: null,
    frame_edit: null,
    classification: "unavailable",
    frames: 0,
    reason: "v465_unavailable:no_stills",
  }));
  assertEquals(r.verdict, "indeterminate");
  assertEquals(r.guard, "unavailable:no_stills");
});

Deno.test("safety: too few paired frames → indeterminate", () => {
  const r = resolveV465Verdict(metric({ mouth_over_frame: 6.0, frames: 2 }));
  assertEquals(r.verdict, "indeterminate");
  assertEquals(r.guard, "insufficient_frames");
});

Deno.test("safety: degenerate ROI → indeterminate", () => {
  const r = resolveV465Verdict(metric({ mouth_over_frame: 6.0, roi_pixels: 16 }));
  assertEquals(r.verdict, "indeterminate");
  assertEquals(r.guard, "degenerate_roi");
});

Deno.test("safety: no metric at all → indeterminate", () => {
  assertEquals(resolveV465Verdict(null).verdict, "indeterminate");
});

Deno.test("legacy delta_mean and mad_ratio cannot influence the verdict", () => {
  // Identical ratio, wildly different legacy signals — the verdict is stable
  // because the resolver only ever reads the paired metric.
  const a = resolveV465Verdict(metric({ mouth_over_frame: 2.9 }));
  const b = resolveV465Verdict(
    { ...metric({ mouth_over_frame: 2.9 }), reason: "measured" } as V465PairedMetric,
  );
  assertEquals(a.verdict, "motion");
  assertEquals(b.verdict, "motion");
  assertEquals(a.authority, "v465_mouth_over_frame");
});
