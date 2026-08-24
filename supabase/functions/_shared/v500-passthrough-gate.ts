/**
 * V500-B2 — OUTCOME GATE RESTRICTED TO ITS ORIGINAL PURPOSE (PURE)
 * ---------------------------------------------------------------------------
 * The original contract of the outcome gate was exactly one sentence:
 *
 *     Prevent a real passthrough from being sold as lip-sync.
 *
 * It was never: "decide whether the mouth-edit rate relative to frame motion
 * exceeds an empirical threshold". That extension is what terminalized runs
 * the provider had in fact edited.
 *
 * Evidence that the metric alone must not be terminal:
 *   - `docs/v473-detector-validity-audit.md` — the KNOWN-GOOD golden run
 *     scores 1.43 / 1.79 / 1.91 / 2.42 at the production ROI centring, i.e.
 *     3 of 4 passes would be a terminal NOOP today although the clip is
 *     visibly correct. Move the ROI onto the real mouth band and the same
 *     passes score 3.06 – 5.66.
 *   - `docs/v471a-roi-sampling-parity.md` — false NOOPs produced by the
 *     measurement region, not by the provider.
 *
 * So the scalar is kept (V465 stays the measurement authority) but its
 * TERMINALITY is bound to the provenance of the region it was measured in:
 *
 *     motion                                   -> accept
 *     noop  AND mouth anchor was OBSERVED      -> proven_passthrough (terminal)
 *     noop  AND anchor merely derived/unknown  -> unknown (non-terminal)
 *     indeterminate                            -> unknown (non-terminal)
 *
 * `unknown` never terminalizes, never refunds, never turns green — it is the
 * existing `motion_unverified` pass-through state.
 *
 * RELEASE GUARDRAIL (V500): any change to this gate that classifies a golden
 * pass as `proven_passthrough` is by definition not releasable. Enforced by
 * `v500-passthrough-gate.test.ts`.
 *
 * PURE: no IO, no DB, no provider dispatch.
 */

import type { V465VerdictResult } from "./v465-verdict.ts";
import type { V471MouthAnchorSource } from "./v471-mouth-roi.ts";

/**
 * Only a real mouth OBSERVATION makes a low ratio trustworthy enough to be
 * terminal. A face-ratio estimate is exactly the derivation V473 falsified.
 */
export const V500_TERMINAL_ANCHOR_SOURCES: readonly V471MouthAnchorSource[] = [
  "landmark",
];

export type V500Outcome = "accept" | "proven_passthrough" | "unknown";

export interface V500GateInput {
  verdict: V465VerdictResult;
  /** `V471RoiResult.anchorSource` of the ROI the verdict was measured in. */
  mouthAnchorSource?: V471MouthAnchorSource | string | null;
}

export interface V500GateResult {
  outcome: V500Outcome;
  /** True only for `proven_passthrough`. */
  terminal: boolean;
  reason: string;
  anchorSource: string;
  anchorVerified: boolean;
  mouth_over_frame: number | null;
  authority: "v500_passthrough_gate";
}

export function isV500TerminalAnchor(source: unknown): boolean {
  return V500_TERMINAL_ANCHOR_SOURCES.includes(String(source ?? "") as V471MouthAnchorSource);
}

/** PURE — the V500-B2 outcome decision. */
export function resolveV500Outcome(input: V500GateInput): V500GateResult {
  const verdict = input.verdict;
  const anchorSource = String(input.mouthAnchorSource ?? "unknown");
  const anchorVerified = isV500TerminalAnchor(anchorSource);
  const base = {
    anchorSource,
    anchorVerified,
    mouth_over_frame: verdict?.mouth_over_frame ?? null,
    authority: "v500_passthrough_gate" as const,
  };

  if (verdict?.verdict === "motion") {
    return { ...base, outcome: "accept", terminal: false, reason: verdict.reason };
  }

  if (verdict?.verdict === "noop") {
    if (anchorVerified) {
      return {
        ...base,
        outcome: "proven_passthrough",
        terminal: true,
        reason: `v500_proven_passthrough:${verdict.reason}`,
      };
    }
    return {
      ...base,
      outcome: "unknown",
      terminal: false,
      reason:
        `v500_noop_unverified_anchor:anchor=${anchorSource} mouth_over_frame=${verdict.mouth_over_frame ?? "n/a"}`,
    };
  }

  return {
    ...base,
    outcome: "unknown",
    terminal: false,
    reason: verdict?.reason ?? "v500_verdict_missing",
  };
}
