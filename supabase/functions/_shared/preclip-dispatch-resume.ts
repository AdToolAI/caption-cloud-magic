/**
 * FA-4/P0 — Idempotent Preclip Dispatch Resume (exactly-once)
 *
 * Pure decision helpers shared by `pass-face-preclip.ts` (dispatch resilience)
 * and `invoke-remotion-render` (atomic dispatch claim). Keeping them pure makes
 * the exactly-once contract testable without hitting AWS or the database.
 *
 * Contract (locked):
 *  - exactly one `video_renders` row / one `pendingRenderId` per logical preclip;
 *  - `content_config.lambda_invoked_at` is the final start fence: once set, no
 *    caller may ever start AWS again — no matter how much time has passed;
 *  - a 5xx / network failure is `dispatch_uncertain`, never a row-destroying
 *    `dispatch_failed`;
 *  - a re-invoke is allowed only while no claim exists, and always reuses the
 *    same `pendingRenderId`;
 *  - no progress until the budget ends → v187 fail-closed + exactly one refund.
 */

export type DispatchOutcome = {
  ok: boolean;
  status: number;
  body: string;
  networkError: string | null;
};

export type DispatchVerdict = "ok" | "definitive_rejection" | "dispatch_uncertain";

/**
 * Classify by proof of send, NOT by HTTP family.
 * Only failures that provably happened locally, before anything could reach the
 * render service, are definitive (and therefore non-retryable).
 */
export function classifyDispatchOutcome(outcome: DispatchOutcome): DispatchVerdict {
  if (outcome.ok) return "ok";
  if (outcome.networkError) return "dispatch_uncertain";
  if (outcome.status >= 400 && outcome.status < 500) return "definitive_rejection";
  if (
    /aws_credentials_missing|invalid_input|dispatch_claim_failed|are required|scheduling conflict/i
      .test(outcome.body)
  ) {
    return "definitive_rejection";
  }
  return "dispatch_uncertain";
}

export type ClaimState = {
  lambdaInvokedAt?: string | null;
  realRemotionRenderId?: string | null;
  status?: string | null;
};

/** True when a dispatch claim (or later progress) exists for this render row. */
export function hasDispatchClaim(state: ClaimState): boolean {
  return !!state.lambdaInvokedAt ||
    !!state.realRemotionRenderId ||
    state.status === "rendering" ||
    state.status === "completed";
}

/**
 * After an uncertain dispatch: poll only when a claim exists, re-invoke the same
 * pendingRenderId only when provably no claim was ever taken.
 */
export function decideAfterUncertainDispatch(state: ClaimState): "poll_only" | "reinvoke_same_id" {
  return hasDispatchClaim(state) ? "poll_only" : "reinvoke_same_id";
}

/**
 * Decision inside `invoke-remotion-render` before touching AWS.
 * `cas_claim` means: attempt the compare-and-set; only the winner calls AWS.
 */
export function decideInvokeAction(
  state: ClaimState,
): "already_started" | "already_started_unresolved" | "cas_claim" {
  if (state.realRemotionRenderId || state.status === "completed") return "already_started";
  if (state.lambdaInvokedAt) return "already_started_unresolved";
  return "cas_claim";
}

/**
 * Terminal class when the poll budget expires. An uncertain dispatch keeps its
 * own diagnosis class and must never collapse into `poll_timeout`.
 */
export function terminalClassOnNoProgress(
  dispatchUncertain: boolean,
): "dispatch_uncertain" | "poll_timeout" {
  return dispatchUncertain ? "dispatch_uncertain" : "poll_timeout";
}
