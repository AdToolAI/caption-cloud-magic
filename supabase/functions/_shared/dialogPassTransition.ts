/**
 * Alpha-Plan v3.1 §1.9 — Terminal Transition Guard (Phase B1).
 *
 * Central helper that enforces the v128 invariant:
 *
 *   "Terminal means terminal. A terminal pass remains terminal until an
 *    explicit user retry creates a new attempt_id."
 *
 * Any code path that flips `composer_scenes.dialog_shots.passes[i].status`
 * from a terminal state (done / done_suspect / failed / canceled_by_scene_failure)
 * back to a non-terminal state (pending / retrying / dispatched / rendering)
 * MUST first call `assertCanLeaveTerminal(...)`. If the guard returns false
 * the caller MUST abort the write and rely on the user-retry flow instead.
 *
 * Illegal transitions are logged as Sentry-P1 equivalents via
 * `syncso_dispatch_log` (sync_status=ILLEGAL_TERMINAL_TRANSITION_BLOCKED).
 */

type SB = any;

const TERMINAL_PASS_STATUSES = new Set<string>([
  "done",
  "done_suspect",
  "failed",
  "canceled_by_scene_failure",
]);

const NON_TERMINAL_TARGET_STATUSES = new Set<string>([
  "pending",
  "retrying",
  "dispatched",
  "rendering",
]);

export function isTerminalPassStatus(status: unknown): boolean {
  return typeof status === "string" && TERMINAL_PASS_STATUSES.has(status);
}

export function isNonTerminalTarget(status: unknown): boolean {
  return typeof status === "string" && NON_TERMINAL_TARGET_STATUSES.has(status);
}

export interface TransitionContext {
  scene_id: string;
  pass_idx: number;
  source: string;
  /** Set to true ONLY when the request originated from an explicit user-retry action. */
  user_retry_flag?: boolean;
  /** New attempt_id minted for this user-retry. MUST differ from prev_attempt_id. */
  new_attempt_id?: string | null;
  prev_attempt_id?: string | null;
  /** "success" if credits were freshly debited for this retry; "skip" for advance/internal. */
  credit_charge_result?: "success" | "skip" | "failed";
  /** Existing provider job_id on the pass. MUST be null before leaving terminal. */
  active_provider_job_id?: string | null;
}

export interface GuardResult {
  ok: boolean;
  blocked?: boolean;
  reason?: string;
}

/**
 * Pure predicate: would this transition violate the v128 terminal invariant?
 */
export function canLeaveTerminal(
  currentStatus: unknown,
  ctx: TransitionContext,
): GuardResult {
  if (!isTerminalPassStatus(currentStatus)) return { ok: true };
  if (ctx.user_retry_flag !== true) {
    return { ok: false, blocked: true, reason: "missing_user_retry_flag" };
  }
  if (!ctx.new_attempt_id || ctx.new_attempt_id === ctx.prev_attempt_id) {
    return { ok: false, blocked: true, reason: "missing_or_reused_attempt_id" };
  }
  if (ctx.credit_charge_result !== "success") {
    return { ok: false, blocked: true, reason: "credit_charge_not_success" };
  }
  if (ctx.active_provider_job_id != null) {
    return { ok: false, blocked: true, reason: "active_provider_job_id_present" };
  }
  return { ok: true };
}

export async function logIllegalTransition(
  supabase: SB,
  ctx: TransitionContext,
  fromStatus: unknown,
  toStatus: string,
  reason: string,
): Promise<void> {
  const meta = {
    v128_guard: true,
    sentry_p1: "ILLEGAL_TERMINAL_TRANSITION_BLOCKED",
    from_status: fromStatus ?? null,
    to_status: toStatus,
    reason,
    pass_idx: ctx.pass_idx,
    attempt_id: ctx.new_attempt_id ?? null,
    prev_attempt_id: ctx.prev_attempt_id ?? null,
    user_retry_flag: ctx.user_retry_flag === true,
    active_provider_job_id: ctx.active_provider_job_id ?? null,
    dispatch_source: ctx.source,
  };
  console.error(
    `[transition-guard] ILLEGAL_TERMINAL_TRANSITION_BLOCKED scene=${ctx.scene_id} ` +
      `pass=${ctx.pass_idx} ${String(fromStatus ?? "?")}→${toStatus} ` +
      `reason=${reason} source=${ctx.source}`,
  );
  try {
    await supabase.from("syncso_dispatch_log").insert({
      scene_id: ctx.scene_id,
      engine: "sync-segments",
      sync_status: "ILLEGAL_TERMINAL_TRANSITION_BLOCKED",
      error_class: "v128_guard_block",
      error_message:
        `terminal=${String(fromStatus ?? "?")} → ${toStatus} blocked: ${reason}`.slice(0, 500),
      meta,
    });
  } catch (e) {
    console.warn(
      `[transition-guard] failed to log block scene=${ctx.scene_id}: ${(e as Error).message}`,
    );
  }
}

/**
 * Returns true if the transition is allowed, false (and logs P1) if blocked.
 * Callers MUST short-circuit (skip the write + return early) on `false`.
 */
export async function assertCanLeaveTerminal(
  supabase: SB,
  ctx: TransitionContext,
  currentStatus: unknown,
  intendedStatus: string,
): Promise<boolean> {
  const guard = canLeaveTerminal(currentStatus, ctx);
  if (guard.ok) return true;
  await logIllegalTransition(
    supabase,
    ctx,
    currentStatus,
    intendedStatus,
    guard.reason ?? "unknown",
  );
  return false;
}

/**
 * Convenience helper for entry-points (compose-dialog-segments advance/retry).
 * Reads the current pass status from `composer_scenes.dialog_shots.passes[idx]`
 * and runs the guard. Returns true if it's safe to proceed.
 */
export async function assertSafeDispatchEntry(
  supabase: SB,
  ctx: TransitionContext,
  intendedStatus: string,
): Promise<{ ok: boolean; currentStatus?: string | null; blocked?: boolean; reason?: string }> {
  try {
    const { data: row } = await supabase
      .from("composer_scenes")
      .select("dialog_shots")
      .eq("id", ctx.scene_id)
      .maybeSingle();
    const passes: any[] = Array.isArray((row as any)?.dialog_shots?.passes)
      ? (row as any).dialog_shots.passes
      : [];
    const pass = passes[ctx.pass_idx] ?? null;
    const currentStatus: string | null = pass?.status ?? null;
    const activeJobId: string | null = pass?.job_id ?? null;
    const prevAttemptId: string | null = pass?.attempt_id ?? null;
    const enrichedCtx: TransitionContext = {
      ...ctx,
      active_provider_job_id: ctx.active_provider_job_id ?? activeJobId,
      prev_attempt_id: ctx.prev_attempt_id ?? prevAttemptId,
    };
    const guard = canLeaveTerminal(currentStatus, enrichedCtx);
    if (guard.ok) return { ok: true, currentStatus };
    await logIllegalTransition(
      supabase,
      enrichedCtx,
      currentStatus,
      intendedStatus,
      guard.reason ?? "unknown",
    );
    return { ok: false, blocked: true, currentStatus, reason: guard.reason };
  } catch (e) {
    // Fail-open on guard infrastructure errors — better to dispatch than wedge.
    console.warn(
      `[transition-guard] assertSafeDispatchEntry infra error scene=${ctx.scene_id}: ${(e as Error).message}`,
    );
    return { ok: true };
  }
}
