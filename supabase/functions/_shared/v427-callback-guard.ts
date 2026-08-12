/**
 * v427A3 — Callback guard (observe → enforce).
 *
 * The legacy `active_run_id` / `plate_generation` check stays exactly where it
 * is and keeps full authority. This guard runs AFTER it and adds the second,
 * finer identity check from the job ledger written in A2.
 *
 * Modes (`v427.callback_guard_mode`, default "off"):
 *   off      — no DB reads at all, byte-identical to v426.
 *   observe  — evaluates + logs, but ALWAYS lets the callback proceed.
 *   enforce  — rejects only for reasons that are provably wrong deliveries.
 *
 * Freeze contract: this module never touches framing, masks, payloads,
 * thresholds or timing — it only answers "may this write proceed at all".
 * A missing ledger row is never a rejection: dual-write may be off or the run
 * may predate A2, and the lip-sync chain must not stall on telemetry gaps.
 */

import { getCallbackGuardMode, type CallbackGuardMode } from "./v427-flags.ts";
import {
  assertActivePipelineJob,
  claimPipelineCallback,
  logRejectedCallback,
  type CallbackIdentity,
  type GateResult,
  type RejectReason,
} from "./composer-pipeline-jobs.ts";

/** Reasons that may block a callback once the guard is enforcing. */
export const ENFORCEABLE_REASONS: RejectReason[] = [
  "wrong_run",
  "wrong_job",
  "duplicate_callback",
  "stale_callback",
  "claim_locked",
];

export interface GuardOutcome {
  proceed: boolean;
  mode: CallbackGuardMode;
  reason?: RejectReason;
  claimToken?: string;
  jobId?: string | null;
}

export interface GuardOptions {
  /** false → non-consuming heartbeat validation (pollers, internal workers). */
  consume?: boolean;
  userId?: string | null;
}

export async function guardCallback(
  admin: any,
  id: CallbackIdentity,
  opts: GuardOptions = {},
): Promise<GuardOutcome> {
  let mode: CallbackGuardMode = "off";
  try {
    mode = await getCallbackGuardMode(admin, opts.userId ?? null);
    if (mode === "off") return { proceed: true, mode };

    const consume = opts.consume !== false;
    const result: GateResult = consume
      ? await claimPipelineCallback(admin, id)
      : await assertActivePipelineJob(admin, id);

    if (result.ok) {
      return {
        proceed: true,
        mode,
        claimToken: result.claimToken,
        jobId: result.job?.id ?? null,
      };
    }

    logRejectedCallback(id, result.reason ?? "job_missing", mode);

    // Telemetry gaps and pre-A2 runs never block anything.
    const enforceable =
      mode === "enforce" &&
      !!result.reason &&
      ENFORCEABLE_REASONS.includes(result.reason);

    return {
      proceed: !enforceable,
      mode,
      reason: result.reason,
      jobId: result.job?.id ?? null,
    };
  } catch (e) {
    // Guard failures must never break a real render.
    console.warn("[v427] guardCallback failed", {
      scene_id: id.sceneId,
      run_id: id.runId,
      error: e instanceof Error ? e.message : String(e),
    });
    return { proceed: true, mode };
  }
}

/** Non-consuming heartbeat for pollers. Fully swallowed. */
export async function heartbeatPipelineJob(
  admin: any,
  id: CallbackIdentity,
  userId?: string | null,
): Promise<void> {
  await guardCallback(admin, id, { consume: false, userId });
}
