import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  chargeMatchesRun,
  resolveRefundCandidate,
  refundRunCharge,
  type ChargeRow,
} from "./refund-provenance.ts";

const RUN = "11111111-1111-1111-1111-111111111111";
const RUN2 = "22222222-2222-2222-2222-222222222222";
const PROJECT = "33333333-3333-3333-3333-333333333333";
const USER = "44444444-4444-4444-4444-444444444444";

function charge(over: Partial<ChargeRow>): ChargeRow {
  return {
    id: "c1",
    user_id: USER,
    type: "deduction",
    amount_euros: 6.3,
    generation_id: null,
    metadata: null,
    ...over,
  };
}

// T1 — legacy project aggregate has no run-scoped provenance.
Deno.test("T1 legacy project charge → no candidate", () => {
  const c = charge({ generation_id: PROJECT });
  assertEquals(chargeMatchesRun(c, RUN), false);
  assertEquals(resolveRefundCandidate([c], RUN), null);
});

Deno.test("T1b missing active_run_id → no candidate", () => {
  const c = charge({ generation_id: RUN });
  assertEquals(resolveRefundCandidate([c], null), null);
});

// T2 — run-scoped charge resolves.
Deno.test("T2 run-scoped charge resolves (generation_id)", () => {
  const c = charge({ id: "cx", generation_id: RUN });
  assertEquals(resolveRefundCandidate([c], RUN), "cx");
});

Deno.test("T2b run-scoped charge resolves (metadata.run_id)", () => {
  const c = charge({ id: "cy", metadata: { run_id: RUN } });
  assertEquals(resolveRefundCandidate([c], RUN), "cy");
});

Deno.test("reservation provenance only when DB-verified", () => {
  const c = charge({ id: "cz", metadata: { reservation_id: "r1" } });
  assertEquals(resolveRefundCandidate([c], RUN, []), null);
  assertEquals(
    resolveRefundCandidate([c], RUN, [{ id: "r1", run_ids: [RUN2] }]),
    null,
  );
  assertEquals(
    resolveRefundCandidate([c], RUN, [{ id: "r1", run_ids: [RUN, RUN2] }]),
    "cz",
  );
});

Deno.test("ambiguous candidates → no candidate", () => {
  const a = charge({ id: "a", generation_id: RUN });
  const b = charge({ id: "b", metadata: { run_id: RUN } });
  assertEquals(resolveRefundCandidate([a, b], RUN), null);
});

// T6 — two runs of the same scene stay separated.
Deno.test("T6 two runs of the same scene resolve separately", () => {
  const c1 = charge({ id: "run1-charge", generation_id: RUN });
  const c2 = charge({ id: "run2-charge", generation_id: RUN2 });
  assertEquals(resolveRefundCandidate([c1, c2], RUN), "run1-charge");
  assertEquals(resolveRefundCandidate([c1, c2], RUN2), "run2-charge");
});

// Caller wiring: the RPC is the only money path and its outcome is passed through.
function fakeClient(rows: ChargeRow[], rpcResult: unknown, calls: unknown[]) {
  const builder = (data: unknown) => {
    const b: any = {
      select: () => b,
      eq: () => b,
      in: () => b,
      order: () => b,
      limit: () => Promise.resolve({ data, error: null }),
      then: (r: any) => Promise.resolve({ data, error: null }).then(r),
    };
    return b;
  };
  return {
    from: (t: string) => builder(t === "ai_video_transactions" ? rows : []),
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return Promise.resolve({ data: rpcResult, error: null });
    },
  };
}

Deno.test("caller: no candidate → no RPC call, no_charge", async () => {
  const calls: unknown[] = [];
  const sb = fakeClient([charge({ generation_id: PROJECT })], null, calls);
  const res = await refundRunCharge(sb as never, USER, RUN, "watchdog_stuck_clip");
  assertEquals(res.outcome, "no_charge");
  assertEquals(res.amount_euros, 0);
  assertEquals(calls.length, 0);
});

// T5 — amount comes from the RPC (charge), never from local pricing.
Deno.test("T5 caller passes through RPC amount, never local pricing", async () => {
  const calls: any[] = [];
  const sb = fakeClient(
    [charge({ id: "cx", generation_id: RUN, amount_euros: 6.3 })],
    { outcome: "refunded", amount_euros: 6.3, refund_transaction_id: "t1" },
    calls,
  );
  const res = await refundRunCharge(sb as never, USER, RUN, "watchdog_stuck_clip");
  assertEquals(res, {
    outcome: "refunded",
    amount_euros: 6.3,
    refund_transaction_id: "t1",
  });
  assertEquals(calls.length, 1);
  assertEquals(calls[0].fn, "composer_refund_charge");
  assertEquals(calls[0].args.p_charge_id, "cx");
  assertEquals(calls[0].args.p_run_id, RUN);
  assertEquals(calls[0].args.p_refund_reason, "watchdog_stuck_clip");
});

Deno.test("caller: already_refunded is surfaced with 0 €", async () => {
  const calls: unknown[] = [];
  const sb = fakeClient(
    [charge({ id: "cx", generation_id: RUN })],
    { outcome: "already_refunded", amount_euros: 0, refund_transaction_id: "t1" },
    calls,
  );
  const res = await refundRunCharge(sb as never, USER, RUN, "watchdog_stuck_clip");
  assertEquals(res.outcome, "already_refunded");
  assertEquals(res.amount_euros, 0);
});

Deno.test("caller: empty reason never reaches the RPC", async () => {
  const calls: unknown[] = [];
  const sb = fakeClient([charge({ id: "cx", generation_id: RUN })], null, calls);
  const res = await refundRunCharge(sb as never, USER, RUN, "   ");
  assertEquals(res.outcome, "no_charge");
  assertEquals(calls.length, 0);
});
