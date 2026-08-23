/**
 * V459 — Preflight-Zombie-Recovery + Terminal Fan-out Aggregation
 * ---------------------------------------------------------------
 * Reine Entscheidungslogik (keine I/O), damit Watchdog, Dispatcher und Tests
 * exakt dieselben Invarianten benutzen:
 *
 *  1. Aggregation hat Vorrang vor Zombie-Recovery. Ein bereits verlorener Run
 *     bekommt kein Recovery-Budget mehr.
 *  2. Zombie-Erkennung altert ausschliesslich auf `v459_preflight_started_at`
 *     (Fallback: Legacy `preflight_started_at`), NIE auf `started_at`.
 *  3. Terminalisierung erst nach gesetztem Fan-out-Fence, und ein Refund nur,
 *     wenn KEIN Provider-Job mehr unreconciled in-flight ist.
 */

/** Lease-Dauer des Per-Pass-Locks in `compose-dialog-segments`. */
export const V459_DIALOG_LOCK_TTL_S = 420;
/** Puffer, damit der Watchdog nie vor der normalen Lease-Recovery eingreift. */
export const V459_PREFLIGHT_ZOMBIE_BUFFER_S = 60;
/** Zombie-Schwelle, deterministisch aus der Lease abgeleitet (480 s). */
export const V459_PREFLIGHT_ZOMBIE_MS =
  (V459_DIALOG_LOCK_TTL_S + V459_PREFLIGHT_ZOMBIE_BUFFER_S) * 1000;

/** Maximal EIN Recovery pro (run_id, pass_idx). */
export const V459_MAX_PREFLIGHT_RECOVERIES = 1;

/** Marker im `dialog_shots`-JSONB: Fan-out ist geschlossen, kein Dispatch mehr. */
export const V459_FANOUT_CLOSED_KEY = "v459_fanout_closed";
export const V459_TERMINALIZING_STATUS = "terminalizing";

export interface V459Pass {
  idx?: number;
  status?: string | null;
  job_id?: string | null;
  run_id?: string | null;
  started_at?: string | null;
  preflight_started_at?: string | null;
  v459_preflight_started_at?: string | null;
  v459_preflight_recovery_count?: number | null;
  v459_preflight_recovery_run_id?: string | null;
  last_error_class?: string | null;
  error?: string | null;
  [k: string]: unknown;
}

const TERMINAL_FAILURE_STATUSES = new Set([
  "failed",
  "canceled_by_scene_failure",
]);

/** Ein Pass, der endgueltig gescheitert ist — der Run kann nicht mehr vollstaendig werden. */
export function isTerminalPassFailure(p: V459Pass | null | undefined): boolean {
  if (!p) return false;
  return TERMINAL_FAILURE_STATUSES.has(String(p.status ?? ""));
}

/**
 * Echter, noch nicht abgeschlossener Provider-Job. NUR `rendering`/`retrying`
 * MIT `job_id` zaehlt — ein Pass ohne job_id hat den Provider nie erreicht.
 */
export function hasUnreconciledProviderJob(p: V459Pass | null | undefined): boolean {
  if (!p) return false;
  const st = String(p.status ?? "");
  const hasJob = typeof p.job_id === "string" && p.job_id.length > 0;
  if (!hasJob) return false;
  return st === "rendering" || st === "retrying" || st === "rendering_preflight";
}

export interface V459AggregationVerdict {
  /** Mindestens ein Required-Pass ist terminal gescheitert. */
  runIrrecoverable: boolean;
  /** Indizes der Pässe mit noch offenem Provider-Job. */
  unreconciledPassIdxs: number[];
  /** Fence setzen + terminalisieren + genau ein Refund. */
  canTerminalizeNow: boolean;
  /** Indizes, die nie mehr dispatcht werden dürfen. */
  blockedPassIdxs: number[];
  reason: string;
}

export function evaluateRunAggregation(
  passes: Array<V459Pass | null | undefined>,
): V459AggregationVerdict {
  const list = Array.isArray(passes) ? passes : [];
  const terminal: number[] = [];
  const unreconciled: number[] = [];
  const blocked: number[] = [];

  list.forEach((p, i) => {
    if (isTerminalPassFailure(p)) terminal.push(i);
    else if (hasUnreconciledProviderJob(p)) unreconciled.push(i);
    else if (String(p?.status ?? "") !== "done") blocked.push(i);
  });

  const runIrrecoverable = terminal.length > 0;
  const canTerminalizeNow = runIrrecoverable && unreconciled.length === 0;

  return {
    runIrrecoverable,
    unreconciledPassIdxs: unreconciled,
    canTerminalizeNow,
    blockedPassIdxs: runIrrecoverable ? blocked : [],
    reason: !runIrrecoverable
      ? "run_still_recoverable"
      : canTerminalizeNow
        ? "terminal_required_pass_no_inflight"
        : "terminal_required_pass_awaiting_reconciliation",
  };
}

/** Der einzig zulaessige Zeitanker für die Zombie-Uhr. */
export function preflightStartedAtMs(p: V459Pass | null | undefined): number {
  const raw = p?.v459_preflight_started_at ?? p?.preflight_started_at ?? null;
  if (typeof raw !== "string") return NaN;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : NaN;
}

export interface V459ZombieCheck {
  pass: V459Pass | null | undefined;
  activeRunId: string | null | undefined;
  nowMs: number;
  thresholdMs?: number;
}

/**
 * Kandidatenpruefung — bewusst OHNE Lock-Lookup. Der Watchdog beweist
 * Exklusivitaet danach ueber `try_acquire_dialog_lock` (kein TOCTOU).
 */
export function isPreflightZombieCandidate(c: V459ZombieCheck): boolean {
  const p = c.pass;
  if (!p) return false;
  if (String(p.status ?? "") !== "rendering_preflight") return false;
  if (typeof p.job_id === "string" && p.job_id.length > 0) return false;
  if (c.activeRunId && p.run_id && String(p.run_id) !== String(c.activeRunId)) return false;
  const startedMs = preflightStartedAtMs(p);
  if (!Number.isFinite(startedMs)) return false;
  const threshold = c.thresholdMs ?? V459_PREFLIGHT_ZOMBIE_MS;
  return c.nowMs - startedMs > threshold;
}

/** Recovery-Budget pro (run_id, pass_idx) — ein neuer Run erbt nichts. */
export function preflightRecoveryCount(
  p: V459Pass | null | undefined,
  activeRunId: string | null | undefined,
): number {
  if (!p) return 0;
  const storedRun = p.v459_preflight_recovery_run_id ?? null;
  if (activeRunId && storedRun && String(storedRun) !== String(activeRunId)) return 0;
  const n = Number(p.v459_preflight_recovery_count ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export type V459ZombieAction = "reset_to_pending" | "fail_pass_then_aggregate";

export function decideZombieAction(
  p: V459Pass | null | undefined,
  activeRunId: string | null | undefined,
): V459ZombieAction {
  return preflightRecoveryCount(p, activeRunId) < V459_MAX_PREFLIGHT_RECOVERIES
    ? "reset_to_pending"
    : "fail_pass_then_aggregate";
}

/** Fan-out geschlossen? Dann darf kein Dispatcher mehr zum Provider. */
export function isFanoutClosed(dialogShots: Record<string, unknown> | null | undefined): boolean {
  if (!dialogShots) return false;
  if ((dialogShots as Record<string, unknown>)[V459_FANOUT_CLOSED_KEY] === true) return true;
  const st = String((dialogShots as { status?: unknown }).status ?? "");
  return st === V459_TERMINALIZING_STATUS || st === "failed" || st === "canceled";
}

/** Terminaler NOOP-Pass — Callback-Reentries sind idempotente No-Ops. */
export function isTerminalNoopPass(p: V459Pass | null | undefined): boolean {
  if (!p) return false;
  if (String(p.status ?? "") !== "failed") return false;
  const cls = String(p.last_error_class ?? p.error ?? "");
  return cls.includes("sync_noop_unrecoverable") || cls.includes("noop_ladder_exhausted");
}
