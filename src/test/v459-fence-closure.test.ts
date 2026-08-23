import { describe, it, expect } from "vitest";
import {
  closeBlockedPasses,
  evaluateRunAggregation,
  V459_CANCELED_STATUS,
} from "../../supabase/functions/_shared/v459-fanout-aggregation";

const NOW = "2026-08-23T18:00:00.000Z";

describe("V459 — Fence-Abschluss ohne Billing-Race", () => {
  it("cancelt blockierte Pässe ohne Provider-Job", () => {
    const passes = [
      { idx: 0, status: "failed", last_error_class: "sync_noop_unrecoverable" },
      { idx: 1, status: "done" },
      { idx: 2, status: "pending" },
    ];
    const verdict = evaluateRunAggregation(passes);
    expect(verdict.canTerminalizeNow).toBe(true);

    const res = closeBlockedPasses(passes, verdict.blockedPassIdxs, {
      nowIso: NOW,
      reason: "v459_terminal_required_pass_failure",
    });
    expect(res.canceledIdxs).toEqual([2]);
    expect(res.passes[2].status).toBe(V459_CANCELED_STATUS);
    expect(res.passes[0].status).toBe("failed");
    expect(res.passes[1].status).toBe("done");
  });

  it("cancelt NIE einen Pass mit laufendem Provider-Job", () => {
    const passes = [
      { idx: 0, status: "failed" },
      { idx: 1, status: "rendering", job_id: "sync-123" },
    ];
    const verdict = evaluateRunAggregation(passes);
    // In-flight Job → noch keine Terminalisierung, kein Refund.
    expect(verdict.canTerminalizeNow).toBe(false);
    expect(verdict.unreconciledPassIdxs).toEqual([1]);

    // Selbst wenn jemand den Index faelschlich als blockiert uebergibt:
    const res = closeBlockedPasses(passes, [1], {
      nowIso: NOW,
      reason: "v459_terminal_required_pass_failure",
    });
    expect(res.canceledIdxs).toEqual([]);
    expect(res.skippedInflightIdxs).toEqual([1]);
    expect(res.passes[1].status).toBe("rendering");
  });

  it("ist idempotent — zweiter Lauf cancelt nichts erneut", () => {
    const passes = [{ idx: 0, status: "failed" }, { idx: 1, status: "pending" }];
    const first = closeBlockedPasses(passes, [1], { nowIso: NOW, reason: "r" });
    const second = closeBlockedPasses(first.passes, [1], { nowIso: NOW, reason: "r" });
    expect(second.canceledIdxs).toEqual([]);
    expect(second.passes[1].status).toBe(V459_CANCELED_STATUS);
  });
});
