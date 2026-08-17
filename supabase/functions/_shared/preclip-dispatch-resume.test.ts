import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  classifyDispatchOutcome,
  decideAfterUncertainDispatch,
  decideInvokeAction,
  hasDispatchClaim,
  terminalClassOnNoProgress,
} from "./preclip-dispatch-resume.ts";

const ok = { ok: true, status: 200, body: "", networkError: null };
const bad502 = { ok: false, status: 502, body: "Bad Gateway", networkError: null };
const netErr = { ok: false, status: 0, body: "", networkError: "connection reset" };
const rejected = { ok: false, status: 400, body: "invalid_input", networkError: null };

/**
 * Minimal CAS simulation of the `video_renders` row: exactly one row, one
 * pendingRenderId, and `lambda_invoked_at` as the atomic claim.
 */
function makeRow() {
  const row: { status: string; lambda_invoked_at: string | null; real_id: string | null } = {
    status: "pending",
    lambda_invoked_at: null,
    real_id: null,
  };
  let awsStarts = 0;
  return {
    row,
    get awsStarts() {
      return awsStarts;
    },
    /** One full invoke-remotion-render pass; returns whether AWS was called. */
    invoke(transport: "ok" | "lost_response") {
      const action = decideInvokeAction({
        lambdaInvokedAt: row.lambda_invoked_at,
        realRemotionRenderId: row.real_id,
        status: row.status,
      });
      if (action !== "cas_claim") return action;
      // CAS: only succeeds while the claim is null.
      if (row.lambda_invoked_at !== null) return "already_started_unresolved";
      row.lambda_invoked_at = new Date().toISOString();
      awsStarts++;
      if (transport === "ok") {
        row.real_id = "aws-" + awsStarts;
        row.status = "rendering";
      }
      return "claimed";
    },
  };
}

// 1 — happy path: one dispatch, one AWS start.
Deno.test("FA-4/P0 #1: clean dispatch starts AWS exactly once", () => {
  const r = makeRow();
  assertEquals(classifyDispatchOutcome(ok), "ok");
  assertEquals(r.invoke("ok"), "claimed");
  assertEquals(r.awsStarts, 1);
});

// 2 — 502 is uncertain, never a definitive failure.
Deno.test("FA-4/P0 #2: 502 and network errors classify as dispatch_uncertain", () => {
  assertEquals(classifyDispatchOutcome(bad502), "dispatch_uncertain");
  assertEquals(classifyDispatchOutcome(netErr), "dispatch_uncertain");
});

// 3 — provable local rejection is definitive, no retry.
Deno.test("FA-4/P0 #3: 4xx / credential errors are definitive rejections", () => {
  assertEquals(classifyDispatchOutcome(rejected), "definitive_rejection");
  assertEquals(
    classifyDispatchOutcome({ ok: false, status: 500, body: "aws_credentials_missing", networkError: null }),
    "definitive_rejection",
  );
});

// 4 — uncertain dispatch WITH a claim: poll only, never restart AWS.
Deno.test("FA-4/P0 #4: claim present after uncertain dispatch → poll only, no second AWS start", () => {
  const r = makeRow();
  // First invoke claimed but the response was lost (502 seen by the caller).
  assertEquals(r.invoke("lost_response"), "claimed");
  assertEquals(r.awsStarts, 1);
  const decision = decideAfterUncertainDispatch({
    lambdaInvokedAt: r.row.lambda_invoked_at,
    realRemotionRenderId: r.row.real_id,
    status: r.row.status,
  });
  assertEquals(decision, "poll_only");
  // Even a (forbidden) re-invoke cannot start AWS again.
  assertEquals(r.invoke("ok"), "already_started_unresolved");
  assertEquals(r.awsStarts, 1);
});

// 5 — uncertain dispatch WITHOUT a claim: re-invoke the SAME id, one AWS start.
Deno.test("FA-4/P0 #5: no claim after uncertain dispatch → reinvoke same id", () => {
  const r = makeRow();
  const decision = decideAfterUncertainDispatch({
    lambdaInvokedAt: r.row.lambda_invoked_at,
    realRemotionRenderId: r.row.real_id,
    status: r.row.status,
  });
  assertEquals(decision, "reinvoke_same_id");
  assertEquals(r.invoke("ok"), "claimed");
  assertEquals(r.awsStarts, 1);
});

// 6 — concurrent callers race the CAS: exactly one winner.
Deno.test("FA-4/P0 #6: concurrent invokes produce exactly one AWS start", () => {
  const r = makeRow();
  const results = [r.invoke("ok"), r.invoke("ok"), r.invoke("ok")];
  assertEquals(results[0], "claimed");
  assertEquals(results.filter((x) => x === "claimed").length, 1);
  assertEquals(r.awsStarts, 1);
});

// 7 — a finished render is a no-op, no new claim.
Deno.test("FA-4/P0 #7: completed / real render id short-circuits to already_started", () => {
  assertEquals(decideInvokeAction({ status: "completed" }), "already_started");
  assertEquals(decideInvokeAction({ realRemotionRenderId: "aws-1" }), "already_started");
  assertEquals(hasDispatchClaim({ status: "rendering" }), true);
  assertEquals(hasDispatchClaim({ status: "pending" }), false);
});

// 8 — no progress until budget end keeps its own class (v187 fail-closed + one refund).
Deno.test("FA-4/P0 #8: no progress after uncertain dispatch does not collapse into poll_timeout", () => {
  assertEquals(terminalClassOnNoProgress(true), "dispatch_uncertain");
  assertEquals(terminalClassOnNoProgress(false), "poll_timeout");
});
