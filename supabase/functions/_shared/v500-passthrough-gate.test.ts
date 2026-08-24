import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveV500Outcome } from "./v500-passthrough-gate.ts";
import { resolveV465Verdict } from "./v465-verdict.ts";

function metric(ratio: number, frameEdit = 1.0) {
  return {
    classification: "measured",
    reason: "ok",
    mouth_over_frame: ratio,
    mouth_edit: ratio * frameEdit,
    frame_edit: frameEdit,
    frames: 6,
    roi_pixels: 55000,
  } as any;
}

/** docs/v473 — golden run at the PRODUCTION ROI centring (cy = 0.50). */
const GOLDEN_PRODUCTION_ROI = [
  { pass: 0, ratio: 2.42, frameEdit: 0.912 },
  { pass: 1, ratio: 1.43, frameEdit: 1.107 },
  { pass: 2, ratio: 1.79, frameEdit: 0.846 },
  { pass: 3, ratio: 1.91, frameEdit: 0.875 },
];

/** docs/v473 — same passes measured on the real mouth band. */
const GOLDEN_REAL_MOUTH = [4.29, 4.68, 5.48, 5.32];

Deno.test("V500 guardrail — no golden pass is ever proven_passthrough (derived anchor)", () => {
  for (const g of GOLDEN_PRODUCTION_ROI) {
    const verdict = resolveV465Verdict(metric(g.ratio, g.frameEdit));
    const gate = resolveV500Outcome({ verdict, mouthAnchorSource: "face_ratio" });
    assertEquals(gate.terminal, false, `pass ${g.pass} must not terminalize`);
    assertEquals(gate.outcome, "unknown");
  }
});

Deno.test("V500 guardrail — golden passes on the real mouth band are accepted", () => {
  for (const ratio of GOLDEN_REAL_MOUTH) {
    const verdict = resolveV465Verdict(metric(ratio));
    const gate = resolveV500Outcome({ verdict, mouthAnchorSource: "landmark" });
    assertEquals(gate.outcome, "accept");
    assertEquals(gate.terminal, false);
  }
});

Deno.test("V500 — low ratio on an OBSERVED mouth is a proven passthrough", () => {
  const gate = resolveV500Outcome({
    verdict: resolveV465Verdict(metric(1.05)),
    mouthAnchorSource: "landmark",
  });
  assertEquals(gate.outcome, "proven_passthrough");
  assertEquals(gate.terminal, true);
});

Deno.test("V500 — unresolved / unknown anchor never terminalizes", () => {
  for (const src of ["unresolved", null, undefined, "pose_estimate"]) {
    const gate = resolveV500Outcome({
      verdict: resolveV465Verdict(metric(1.05)),
      mouthAnchorSource: src as any,
    });
    assertEquals(gate.terminal, false, `anchor ${String(src)}`);
    assertEquals(gate.outcome, "unknown");
  }
});

Deno.test("V500 — gray band stays non-terminal regardless of anchor", () => {
  for (const src of ["landmark", "face_ratio"]) {
    const gate = resolveV500Outcome({
      verdict: resolveV465Verdict(metric(2.3)),
      mouthAnchorSource: src as any,
    });
    assertEquals(gate.outcome, "unknown");
    assertEquals(gate.terminal, false);
  }
});

Deno.test("V500 — unmeasurable verdict is unknown, never terminal", () => {
  const gate = resolveV500Outcome({
    verdict: resolveV465Verdict(null),
    mouthAnchorSource: "landmark",
  });
  assertEquals(gate.outcome, "unknown");
  assertEquals(gate.terminal, false);
});
