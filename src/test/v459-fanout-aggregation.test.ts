import { describe, it, expect } from "vitest";
import {
  evaluateRunAggregation,
  isPreflightZombieCandidate,
  decideZombieAction,
  preflightRecoveryCount,
  preflightStartedAtMs,
  isFanoutClosed,
  isTerminalNoopPass,
  hasUnreconciledProviderJob,
  V459_PREFLIGHT_ZOMBIE_MS,
  V459_TERMINALIZING_STATUS,
} from "../../supabase/functions/_shared/v459-fanout-aggregation";

const RUN = "run-a";
const now = Date.parse("2026-08-23T18:00:00.000Z");
const ago = (ms: number) => new Date(now - ms).toISOString();

describe("V459 — Zombie-Uhr", () => {
  it("altert NIE auf started_at", () => {
    const p = { status: "rendering_preflight", run_id: RUN, started_at: ago(60 * 60_000) };
    expect(Number.isNaN(preflightStartedAtMs(p))).toBe(true);
    expect(isPreflightZombieCandidate({ pass: p, activeRunId: RUN, nowMs: now })).toBe(false);
  });

  it("erkennt Zombie nach Ablauf auf v459_preflight_started_at", () => {
    const p = {
      status: "rendering_preflight",
      run_id: RUN,
      job_id: null,
      v459_preflight_started_at: ago(V459_PREFLIGHT_ZOMBIE_MS + 1000),
    };
    expect(isPreflightZombieCandidate({ pass: p, activeRunId: RUN, nowMs: now })).toBe(true);
  });

  it("fällt auf legacy preflight_started_at zurück", () => {
    const p = {
      status: "rendering_preflight",
      run_id: RUN,
      preflight_started_at: ago(V459_PREFLIGHT_ZOMBIE_MS + 1),
    };
    expect(isPreflightZombieCandidate({ pass: p, activeRunId: RUN, nowMs: now })).toBe(true);
  });

  it("schont junge Preflights, Pässe mit job_id und fremde Runs", () => {
    const base = { status: "rendering_preflight", run_id: RUN, v459_preflight_started_at: ago(V459_PREFLIGHT_ZOMBIE_MS + 5000) };
    expect(isPreflightZombieCandidate({ pass: { ...base, v459_preflight_started_at: ago(1000) }, activeRunId: RUN, nowMs: now })).toBe(false);
    expect(isPreflightZombieCandidate({ pass: { ...base, job_id: "job-1" }, activeRunId: RUN, nowMs: now })).toBe(false);
    expect(isPreflightZombieCandidate({ pass: { ...base, run_id: "run-old" }, activeRunId: RUN, nowMs: now })).toBe(false);
    expect(isPreflightZombieCandidate({ pass: { ...base, status: "rendering" }, activeRunId: RUN, nowMs: now })).toBe(false);
  });
});

describe("V459 — Recovery-Budget", () => {
  it("erlaubt genau ein Recovery pro (run, pass)", () => {
    expect(decideZombieAction({ v459_preflight_recovery_count: 0 }, RUN)).toBe("reset_to_pending");
    expect(decideZombieAction({ v459_preflight_recovery_count: 1, v459_preflight_recovery_run_id: RUN }, RUN))
      .toBe("fail_pass_then_aggregate");
  });

  it("erbt das Budget eines fremden Runs nicht", () => {
    const p = { v459_preflight_recovery_count: 3, v459_preflight_recovery_run_id: "run-old" };
    expect(preflightRecoveryCount(p, RUN)).toBe(0);
    expect(decideZombieAction(p, RUN)).toBe("reset_to_pending");
  });
});

describe("V459 — Terminal Fan-out Aggregation", () => {
  it("terminalisiert nicht, solange ein Provider-Job unreconciled ist", () => {
    const v = evaluateRunAggregation([
      { status: "failed" },
      { status: "rendering", job_id: "job-9" },
      { status: "pending" },
    ]);
    expect(v.runIrrecoverable).toBe(true);
    expect(v.canTerminalizeNow).toBe(false);
    expect(v.unreconciledPassIdxs).toEqual([1]);
    expect(v.reason).toBe("terminal_required_pass_awaiting_reconciliation");
  });

  it("terminalisiert mit genau einem Refund, wenn nichts mehr in-flight ist", () => {
    const v = evaluateRunAggregation([
      { status: "done" },
      { status: "failed" },
      { status: "pending" },
      { status: "rendering_preflight", job_id: null },
    ]);
    expect(v.canTerminalizeNow).toBe(true);
    expect(v.blockedPassIdxs).toEqual([2, 3]);
  });

  it("lässt rettbare Runs unangetastet", () => {
    const v = evaluateRunAggregation([{ status: "done" }, { status: "pending" }]);
    expect(v.runIrrecoverable).toBe(false);
    expect(v.blockedPassIdxs).toEqual([]);
  });

  it("zählt nur Pässe MIT job_id als in-flight", () => {
    expect(hasUnreconciledProviderJob({ status: "rendering", job_id: null })).toBe(false);
    expect(hasUnreconciledProviderJob({ status: "rendering_preflight", job_id: "j" })).toBe(true);
  });
});

describe("V459 — Fence und Webhook-Idempotenz", () => {
  it("erkennt geschlossenen Fan-out", () => {
    expect(isFanoutClosed({ v459_fanout_closed: true })).toBe(true);
    expect(isFanoutClosed({ status: V459_TERMINALIZING_STATUS })).toBe(true);
    expect(isFanoutClosed({ status: "rendering" })).toBe(false);
    expect(isFanoutClosed(null)).toBe(false);
  });

  it("markiert terminale NOOP-Pässe als idempotente No-Ops", () => {
    expect(isTerminalNoopPass({ status: "failed", error: "sync_noop_unrecoverable" })).toBe(true);
    expect(isTerminalNoopPass({ status: "failed", last_error_class: "noop_ladder_exhausted" })).toBe(true);
    expect(isTerminalNoopPass({ status: "rendering", error: "sync_noop_unrecoverable" })).toBe(false);
    expect(isTerminalNoopPass({ status: "failed", error: "provider_timeout" })).toBe(false);
  });
});
