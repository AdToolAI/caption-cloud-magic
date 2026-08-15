/**
 * v431 G3.1b — Vertrag der Ledger-Akquise.
 *
 * Gesichert werden hier die beiden Eigenschaften, die Doppel-Spend verhindern:
 *  1. Initial-Akquise ist idempotent. Ein aktiver Attempt ⇒ `already_in_flight`,
 *     niemals ein automatischer Replace, niemals fail-open `null`.
 *  2. Ein Dispatch-Fehler wird nur bei beweisbarer Nicht-Annahme terminal.
 *
 * Die echte Concurrency (zwei parallele Initial-Akquisen ⇒ genau eine Zeile)
 * ist DB-seitig in `composer_acquire_pipeline_attempt` verankert und wird per
 * DB-Smoke verifiziert; hier wird der Client-Vertrag darüber geprüft.
 */
import { describe, it, expect, vi } from "vitest";
import {
  acquireLedgerJob,
  classifyDispatchFailure,
  replaceLedgerAttempt,
} from "../../../../supabase/functions/_shared/v431-ledger.ts";

function adminStub(rpcImpl: (name: string, args: any) => any) {
  const rpc = vi.fn(async (name: string, args: any) => rpcImpl(name, args));
  return {
    rpc,
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null }) }),
      }),
    }),
  } as any;
}

const IDENTITY = {
  sceneId: "11111111-1111-4111-8111-111111111111",
  runId: "22222222-2222-4222-8222-222222222222",
  stage: "base_video" as const,
  plateGeneration: 3,
};

describe("v431 G3.1b — acquireLedgerJob", () => {
  it("gibt bei freier Identität `acquired` zurück", async () => {
    const admin = adminStub(() => ({
      data: [{ job_id: "job-1", attempt_no: 1, outcome: "acquired", status: "dispatching" }],
      error: null,
    }));
    const res = await acquireLedgerJob(admin, IDENTITY);
    expect(res.outcome).toBe("acquired");
    expect(admin.rpc).toHaveBeenCalledWith("composer_acquire_pipeline_attempt", expect.anything());
  });

  it("gibt bei aktivem Attempt `already_in_flight` zurück und löst NICHT ab", async () => {
    const admin = adminStub((name) => {
      if (name === "composer_replace_pipeline_attempt") {
        throw new Error("replace must never be called from initial acquire");
      }
      return {
        data: [{ job_id: "job-1", attempt_no: 1, outcome: "already_in_flight", status: "dispatched" }],
        error: null,
      };
    });
    const res = await acquireLedgerJob(admin, IDENTITY);
    expect(res.outcome).toBe("already_in_flight");
    expect(admin.rpc).toHaveBeenCalledTimes(1);
    expect(admin.rpc).not.toHaveBeenCalledWith(
      "composer_replace_pipeline_attempt",
      expect.anything(),
    );
  });

  it("behandelt `dispatch_uncertain` als in-flight (kein versteckter Redispatch)", async () => {
    const admin = adminStub(() => ({
      data: [{ job_id: "job-1", attempt_no: 2, outcome: "already_in_flight", status: "dispatch_uncertain" }],
      error: null,
    }));
    const res = await acquireLedgerJob(admin, IDENTITY);
    expect(res.outcome).toBe("already_in_flight");
    if (res.outcome === "already_in_flight") expect(res.status).toBe("dispatch_uncertain");
  });

  it("ohne Run-Identität: `unavailable`, kein RPC", async () => {
    const admin = adminStub(() => ({ data: null, error: null }));
    const res = await acquireLedgerJob(admin, { ...IDENTITY, runId: null });
    expect(res.outcome).toBe("unavailable");
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("ohne plate_generation wird gar nichts angelegt", async () => {
    const admin = adminStub(() => ({ data: null, error: null }));
    const res = await acquireLedgerJob(admin, { ...IDENTITY, plateGeneration: null });
    expect(res.outcome).toBe("unavailable");
    expect(admin.rpc).not.toHaveBeenCalled();
  });
});

describe("v431 G3.1b — replaceLedgerAttempt", () => {
  it("verweigert einen Retry ohne Vorgänger-Job oder Grund", async () => {
    const admin = adminStub(() => ({ data: null, error: null }));
    const res = await replaceLedgerAttempt(admin, {
      previousJobId: "",
      retryReason: "",
      sceneId: IDENTITY.sceneId,
      runId: IDENTITY.runId,
      stage: "base_video",
      plateGeneration: 3,
    });
    expect(res).toBeNull();
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("verliert deterministisch (null) statt zu dispatchen", async () => {
    const admin = adminStub(() => ({ data: null, error: { message: "not replaceable" } }));
    const res = await replaceLedgerAttempt(admin, {
      previousJobId: "job-1",
      retryReason: "watchdog",
      sceneId: IDENTITY.sceneId,
      runId: IDENTITY.runId,
      stage: "base_video",
      plateGeneration: 3,
    });
    expect(res).toBeNull();
  });
});

describe("v431 G3.1b — classifyDispatchFailure", () => {
  it("nur beweisbare Nicht-Annahme wird terminal", () => {
    for (const msg of ["HTTP 400 bad request", "401 unauthorized", "403 forbidden", "404", "422 validation_failed"]) {
      expect(classifyDispatchFailure(new Error(msg))).toBe("rejected");
    }
  });

  it("408/409/429/5xx und Netzwerkunsicherheit bleiben uncertain", () => {
    for (const msg of ["408 timeout", "409 conflict", "429 rate limited", "500 internal", "503", "socket hang up"]) {
      expect(classifyDispatchFailure(new Error(msg))).toBe("uncertain");
    }
  });
});
