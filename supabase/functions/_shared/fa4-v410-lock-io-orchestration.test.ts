// FA-4 v410 — executable proof: no media/AWS I/O while the dialog lock is held.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifySpeakerCardinality } from "./fa4-speaker-cardinality.ts";
import {
  decideUnderLockIoAction,
  Fa4OutOfLockIoRequired,
  type Fa4OutOfLockIoRequest,
  isFa4OutOfLockIoRequired,
  runLockedPhasesWithOutOfLockIo,
} from "./fa4-lock-phase-orchestration.ts";

const pass = (speakerIdx: number | null, jobId = "j") =>
  speakerIdx === null ? { job_id: jobId } : { speaker_idx: speakerIdx, job_id: jobId };

const card = (passes: unknown[], totalPasses: number) =>
  classifySpeakerCardinality(passes as any[], { totalPasses });

// ── A. Pure decision helper ────────────────────────────────────────────────
Deno.test("A: incomplete pre-lock + fresh multi + no measurement => needs_catch_up_measurement", () => {
  const fresh = card([pass(0), pass(1), pass(0), pass(1)], 4);
  const d = decideUnderLockIoAction({ fresh, preLockDeferred: true, hasMeasurement: false });
  assertEquals(d.action, "needs_catch_up_measurement");
});

Deno.test("A2: fresh multi WITH measurement => multi_apply (no duplicate measurement)", () => {
  const fresh = card([pass(0), pass(1)], 2);
  const d = decideUnderLockIoAction({ fresh, preLockDeferred: true, hasMeasurement: true });
  assertEquals(d.action, "multi_apply");
});

Deno.test("F: fresh state still incomplete => fail_closed speaker_cardinality_indeterminate", () => {
  const fresh = card([pass(0)], 4);
  const d = decideUnderLockIoAction({ fresh, preLockDeferred: true, hasMeasurement: false });
  assertEquals(d.action, "fail_closed");
  if (d.action === "fail_closed") {
    assertEquals(d.writeId, "ssw:failed");
    assertEquals(d.errorText, "speaker_cardinality_indeterminate");
  }
});

Deno.test("E: fresh state single => single path, measurement irrelevant", () => {
  const cases: Array<[unknown[], number]> = [
    [[pass(0), pass(0)], 2],
    [[pass(0), pass(0), pass(0), pass(0), pass(0), pass(0)], 6],
  ];
  for (const [passes, total] of cases) {
    const fresh = card(passes, total);

    assertEquals(
      decideUnderLockIoAction({ fresh, preLockDeferred: true, hasMeasurement: true }).action,
      "single",
    );
    assertEquals(
      decideUnderLockIoAction({ fresh, preLockDeferred: false, hasMeasurement: false }).action,
      "single",
    );
  }
});

// ── Fake orchestration harness (lock-held flag + event log) ────────────────
function harness(phases: Array<(round: number) => unknown>) {
  const events: string[] = [];
  let lockHeld = false;
  let measurements = 0;
  let probes = 0;
  let refreshes = 0;

  const withFakeLock = async <T>(fn: () => Promise<T>): Promise<T> => {
    lockHeld = true;
    events.push("lock_enter");
    try {
      return await fn();
    } finally {
      lockHeld = false;
      events.push("lock_exit");
    }
  };

  const run = () =>
    runLockedPhasesWithOutOfLockIo<string>({
      runLockedPhase: (round) =>
        withFakeLock(async () => {
          const out = phases[round - 1](round);
          if (out instanceof Fa4OutOfLockIoRequired) throw out;
          return String(out);
        }),
      performOutOfLockIo: async (request: Fa4OutOfLockIoRequest) => {
        // C: media/AWS work must never run while the lock is held.
        assert(!lockHeld, "I/O ran while dialog lock was held");
        if (request.kind === "measurement") {
          events.push("measure_start");
          measurements++;
          await Promise.resolve();
          events.push("measure_end");
        } else {
          events.push("probe_start");
          probes++;
          await Promise.resolve();
          events.push("probe_end");
        }
      },
      refreshBetweenRounds: async () => {
        assert(!lockHeld, "state refresh ran while dialog lock was held");
        refreshes++;
        events.push("refresh");
        await Promise.resolve();
      },
    });

  return {
    run,
    events,
    counts: () => ({ measurements, probes, refreshes }),
    lockHeldNow: () => lockHeld,
  };
}

// ── B/C/D. Catch-up runs strictly between two lock scopes ──────────────────
Deno.test("B+C+D: catch-up measurement happens after lock1 exits, before lock2 enters", async () => {
  const h = harness([
    () => new Fa4OutOfLockIoRequired({ kind: "measurement", passIdx: 2 }),
    () => "multi_decision_with_measurement",
  ]);
  const res = await h.run();
  assertEquals(res.outcome, "done");
  if (res.outcome === "done") {
    assertEquals(res.result, "multi_decision_with_measurement");
    assertEquals(res.rounds, 2);
  }
  assertEquals(h.events, [
    "lock_enter",
    "lock_exit",
    "measure_start",
    "measure_end",
    "refresh",
    "lock_enter",
    "lock_exit",
  ]);
  assertEquals(h.counts().measurements, 1);
});

Deno.test("E2: after catch-up the second phase may pick the single path (measurement unused)", async () => {
  const h = harness([
    () => new Fa4OutOfLockIoRequired({ kind: "measurement", passIdx: 0 }),
    () => "single_path",
  ]);
  const res = await h.run();
  assertEquals(res.outcome === "done" && res.result, "single_path");
  assert(h.events.indexOf("measure_end") < h.events.lastIndexOf("lock_enter"));
});

Deno.test("F2: after catch-up the second phase may fail closed without multi success", async () => {
  const h = harness([
    () => new Fa4OutOfLockIoRequired({ kind: "measurement", passIdx: 1 }),
    () => "ssw:failed/speaker_cardinality_indeterminate",
  ]);
  const res = await h.run();
  assertEquals(res.outcome === "done" && res.result, "ssw:failed/speaker_cardinality_indeterminate");
});

// ── G/H. No measurement at all on the complete-single / pre-lock-multi paths ─
Deno.test("G: complete single scene never requests out-of-lock measurement", async () => {
  const h = harness([() => "single_done"]);
  const res = await h.run();
  assertEquals(res.outcome === "done" && res.rounds, 1);
  assertEquals(h.counts().measurements, 0);
  assertEquals(h.events, ["lock_enter", "lock_exit"]);
});

Deno.test("H: confirmed pre-lock multi (measurement present) => zero catch-up rounds", async () => {
  const fresh = card([pass(0), pass(1), pass(0), pass(1)], 4);
  assertEquals(
    decideUnderLockIoAction({ fresh, preLockDeferred: false, hasMeasurement: true }).action,
    "multi_apply",
  );
  const h = harness([() => "multi_done"]);
  await h.run();
  assertEquals(h.counts().measurements, 0);
});

// ── Media probes are out-of-lock I/O too ───────────────────────────────────
Deno.test("media probes are performed outside the lock and retried in a new phase", async () => {
  const h = harness([
    () =>
      new Fa4OutOfLockIoRequired({
        kind: "media_probe",
        headUrls: ["a.mp4", "b.mp4"],
        dimUrls: ["a.mp4"],
      }),
    () => "probed",
  ]);
  const res = await h.run();
  assertEquals(res.outcome === "done" && res.result, "probed");
  assertEquals(h.counts().probes, 1);
  assertEquals(h.events, [
    "lock_enter",
    "lock_exit",
    "probe_start",
    "probe_end",
    "refresh",
    "lock_enter",
    "lock_exit",
  ]);
});

Deno.test("rounds are bounded: endless I/O requests end without apply", async () => {
  const h = harness([
    () => new Fa4OutOfLockIoRequired({ kind: "measurement", passIdx: 0 }),
    () => new Fa4OutOfLockIoRequired({ kind: "measurement", passIdx: 0 }),
    () => new Fa4OutOfLockIoRequired({ kind: "measurement", passIdx: 0 }),
  ]);
  const res = await h.run();
  assertEquals(res.outcome, "rounds_exhausted");
  if (res.outcome === "rounds_exhausted") assertEquals(res.rounds, 3);
});

Deno.test("non-sentinel errors propagate untouched", async () => {
  let thrown: unknown = null;
  try {
    await runLockedPhasesWithOutOfLockIo<string>({
      runLockedPhase: () => Promise.reject(new Error("boom")),
      performOutOfLockIo: () => Promise.resolve(),
    });
  } catch (e) {
    thrown = e;
  }
  assert(thrown instanceof Error && (thrown as Error).message === "boom");
  assert(!isFa4OutOfLockIoRequired(thrown));
});
