import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { adoptPreAcquiredLedgerJob } from "./v431-ledger.ts";

const SCENE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const RUN = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const JOB = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TURN_A = "00000000-0000-4000-8000-000000000001";
const TURN_B = "00000000-0000-4000-8000-000000000002";

/** Minimaler Fake-Client: liefert genau eine Ledger-Zeile zurück. */
function fakeAdmin(row: Record<string, unknown> | null) {
  return {
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        maybeSingle() { return Promise.resolve({ data: row }); },
      };
    },
  };
}

const baseRow = {
  id: JOB,
  scene_id: SCENE,
  run_id: RUN,
  stage: "sync_segment",
  segment_id: TURN_A,
  plate_generation: 3,
  attempt_no: 2,
  status: "pending",
  external_job_id: null,
  replaced_by: null,
};

Deno.test("Retry adoptiert nur bei identischer segment_id", async () => {
  const d = await adoptPreAcquiredLedgerJob(fakeAdmin(baseRow), JOB, {
    sceneId: SCENE,
    stage: "sync_segment",
    runId: RUN,
    plateGeneration: 3,
    segmentId: TURN_A,
  });
  assertEquals(d.outcome, "dispatch");
  assertEquals((d as any).job.attemptNo, 2);
});

Deno.test("Fremde segment_id -> preacquired_segment_mismatch (keine Adoption)", async () => {
  const d = await adoptPreAcquiredLedgerJob(fakeAdmin(baseRow), JOB, {
    sceneId: SCENE,
    stage: "sync_segment",
    runId: RUN,
    segmentId: TURN_B,
  });
  assertEquals(d.outcome, "skip");
  assertEquals((d as any).reason, "preacquired_segment_mismatch");
});

Deno.test("Ledger-Zeile ohne segment_id wird von turn-backed Retry nicht adoptiert", async () => {
  const d = await adoptPreAcquiredLedgerJob(fakeAdmin({ ...baseRow, segment_id: null }), JOB, {
    sceneId: SCENE,
    stage: "sync_segment",
    runId: RUN,
    segmentId: TURN_A,
  });
  assertEquals(d.outcome, "skip");
  assertEquals((d as any).reason, "preacquired_segment_mismatch");
});

Deno.test("Bereits gebundene Zeile wird nie erneut dispatcht", async () => {
  const d = await adoptPreAcquiredLedgerJob(
    fakeAdmin({ ...baseRow, external_job_id: "prov_123" }),
    JOB,
    { sceneId: SCENE, stage: "sync_segment", runId: RUN, segmentId: TURN_A },
  );
  assertEquals(d.outcome, "skip");
  assertEquals((d as any).reason, "preacquired_already_bound");
});
