// FA-4 v409 — ausführbare Tests für die Speaker-Cardinality-Klassifikation.
// Keine Source-String-Assertions: alle Fälle rufen die echten, in der
// Produktion (sync-so-webhook) verwendeten PURE-Helper auf.
import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  classifySpeakerCardinality,
  decideCompletedSpeakerBranch,
  distinctSpeakerIndices,
  isIncompleteSpeakerPassSet,
  planPreLockSpeakerMeasurement,
  planUnderLockSpeakerMeasurement,
  shouldDeferSpeakerMeasurement,
  shouldRunMultiSpeakerMotionMeasurement,
  SPEAKER_CARDINALITY_INDETERMINATE_ERROR,
} from "./fa4-speaker-cardinality.ts";

const turnPass = (speakerIdx: number, idx: number) => ({
  idx,
  speaker_idx: speakerIdx,
  speaker_name: `Speaker ${speakerIdx + 1}`,
  segment_id: `turn-${idx}`,
  status: "pending",
});

const stabilizerPass = (speakerIdx: number, idx: number) => ({
  idx,
  speaker_idx: speakerIdx,
  speaker_name: `stabilizer_${speakerIdx}`,
  is_silent_stabilizer: true,
  stabilizer_pass: true,
});

Deno.test("A — one speaker, one turn → single, no multi-speaker measurement", () => {
  const c = classifySpeakerCardinality([turnPass(0, 0)]);
  assertEquals(c.distinctSpeakerCount, 1);
  assert(c.isSingleSpeaker);
  assertFalse(c.isMultiSpeaker);
  assertFalse(shouldRunMultiSpeakerMotionMeasurement(c));
  assertEquals(decideCompletedSpeakerBranch(c).branch, "single");
});

Deno.test("B — one speaker, two turns → single, no measurement, v231 branch stays selected", () => {
  const passes = [turnPass(0, 0), turnPass(0, 1)];
  const c = classifySpeakerCardinality(passes);
  assertEquals(c.totalPasses, 2);
  assertEquals(c.distinctSpeakerCount, 1);
  assert(c.isSingleSpeaker);
  assertFalse(shouldRunMultiSpeakerMotionMeasurement(c));
  const d = decideCompletedSpeakerBranch(c);
  assertEquals(d.branch, "single");
  assertEquals(d.runMotionMeasurement, false);
});

Deno.test("C — one speaker, six turns → single", () => {
  const passes = [0, 1, 2, 3, 4, 5].map((i) => turnPass(0, i));
  const c = classifySpeakerCardinality(passes);
  assertEquals(c.totalPasses, 6);
  assertEquals(c.distinctSpeakerCount, 1);
  assert(c.isSingleSpeaker);
  assertFalse(shouldRunMultiSpeakerMotionMeasurement(c));
});

Deno.test("D — two speakers, multiple turns → multi, measurement enabled", () => {
  const passes = [0, 1, 0, 1].map((s, i) => turnPass(s, i));
  const c = classifySpeakerCardinality(passes);
  assertEquals(c.distinctSpeakerCount, 2);
  assertEquals(c.speakerIndices, [0, 1]);
  assert(c.isMultiSpeaker);
  assert(shouldRunMultiSpeakerMotionMeasurement(c));
  assertEquals(decideCompletedSpeakerBranch(c).branch, "multi");
});

Deno.test("E — four speakers, six turns (S11-style) → distinct 4, multi", () => {
  const passes = [0, 1, 2, 3, 0, 1].map((s, i) => turnPass(s, i));
  const c = classifySpeakerCardinality(passes);
  assertEquals(c.distinctSpeakerCount, 4);
  assertEquals(c.speakerIndices, [0, 1, 2, 3]);
  assert(c.isMultiSpeaker);
});

Deno.test("F — stabilizers reusing speaker_idx do not inflate cardinality", () => {
  const passes = [
    turnPass(0, 0),
    turnPass(1, 1),
    stabilizerPass(0, 2),
    stabilizerPass(1, 3),
  ];
  const c = classifySpeakerCardinality(passes);
  assertEquals(c.distinctSpeakerCount, 2);
  assertEquals(c.totalPasses, 4);
  assert(c.isMultiSpeaker);

  // Single speaker + stabilizer must stay single.
  const single = classifySpeakerCardinality([turnPass(0, 0), stabilizerPass(0, 1)]);
  assertEquals(single.distinctSpeakerCount, 1);
  assert(single.isSingleSpeaker);
});

Deno.test("G — pass cardinality and speaker cardinality differ explicitly", () => {
  const passes = [0, 1, 2, 3, 0, 1].map((s, i) => turnPass(s, i));
  const c = classifySpeakerCardinality(passes, { totalPasses: 6 });
  assertEquals(c.totalPasses, 6);
  assertEquals(c.distinctSpeakerCount, 4);
  assert(c.totalPasses !== c.distinctSpeakerCount);
  assertEquals(distinctSpeakerIndices(passes).length, 4);
});

Deno.test("H — unknown: multi-pass state without valid speaker_idx fails closed", () => {
  for (
    const passes of [
      [{ idx: 0 }, { idx: 1 }],
      [{ idx: 0, speaker_idx: null }, { idx: 1, speaker_idx: "1" }],
      [{ idx: 0, speaker_idx: NaN }, { idx: 1, speaker_idx: -1 }],
    ]
  ) {
    const c = classifySpeakerCardinality(passes);
    assertEquals(c.distinctSpeakerCount, 0);
    assert(c.isUnknown, `expected unknown for ${JSON.stringify(passes)}`);
    assertFalse(c.isMultiSpeaker);
    assertFalse(c.isSingleSpeaker);
    assertFalse(shouldRunMultiSpeakerMotionMeasurement(c));
    const d = decideCompletedSpeakerBranch(c);
    assertEquals(d.branch, "fail_closed");
    assertEquals(d.runMotionMeasurement, false);
    assertEquals((d as { writeId: string }).writeId, "ssw:noop_fail");
    assertEquals(
      (d as { errorText: string }).errorText,
      SPEAKER_CARDINALITY_INDETERMINATE_ERROR,
    );
    assertEquals(SPEAKER_CARDINALITY_INDETERMINATE_ERROR, "speaker_cardinality_indeterminate");
  }
});

Deno.test("I — historical single pass without speaker_idx stays single-compatible", () => {
  const c = classifySpeakerCardinality([{ idx: 0, status: "pending" }]);
  assertEquals(c.distinctSpeakerCount, 0);
  assert(c.isSingleSpeaker);
  assertFalse(c.isUnknown);
  assertFalse(shouldRunMultiSpeakerMotionMeasurement(c));

  // ...but only for exactly one pass — two passes must NOT degrade to single.
  const two = classifySpeakerCardinality([{ idx: 0 }, { idx: 1 }], { totalPasses: 2 });
  assert(two.isUnknown);
});

Deno.test("regression — pass count alone never decides multi-speaker", () => {
  const oneSpeakerManyTurns = [0, 1, 2, 3].map((i) => turnPass(0, i));
  const c = classifySpeakerCardinality(oneSpeakerManyTurns, { totalPasses: 4 });
  assertFalse(c.isMultiSpeaker);
  assertFalse(shouldRunMultiSpeakerMotionMeasurement(c));
});

// ── v409 Partial-Pass-Race (Fan-Out: pass0 + root total_passes vor Seeding) ──

Deno.test("J — totalPasses=4 with only pass0 observed → unknown, fail closed", () => {
  const c = classifySpeakerCardinality([{ speaker_idx: 0, job_id: "job-0" }], { totalPasses: 4 });
  assert(c.isUnknown);
  assertFalse(c.isSingleSpeaker);
  assertFalse(c.isMultiSpeaker);
  assertFalse(c.passSetComplete);
  assertEquals(c.observedPassCount, 1);
  assertFalse(shouldRunMultiSpeakerMotionMeasurement(c));
  const d = decideCompletedSpeakerBranch(c);
  assertEquals(d.branch, "fail_closed");
  assertEquals((d as { writeId: string }).writeId, "ssw:noop_fail");
  assertEquals(
    (d as { errorText: string }).errorText,
    SPEAKER_CARDINALITY_INDETERMINATE_ERROR,
  );
});

Deno.test("K — totalPasses=6 with only pass0 observed → unknown, fail closed", () => {
  const c = classifySpeakerCardinality([{ speaker_idx: 0, job_id: "job-0" }], { totalPasses: 6 });
  assert(c.isUnknown);
  assertEquals(c.reason, "pass_set_incomplete_1_of_6");
  assertFalse(shouldRunMultiSpeakerMotionMeasurement(c));
  assertEquals(decideCompletedSpeakerBranch(c).branch, "fail_closed");
});

Deno.test("L — complete single-speaker multi-turn sets stay single", () => {
  const two = classifySpeakerCardinality([turnPass(0, 0), turnPass(0, 1)], { totalPasses: 2 });
  assert(two.isSingleSpeaker);
  assert(two.passSetComplete);

  const six = classifySpeakerCardinality(
    [0, 1, 2, 3, 4, 5].map((i) => turnPass(0, i)),
    { totalPasses: 6 },
  );
  assert(six.isSingleSpeaker);
  assertFalse(shouldRunMultiSpeakerMotionMeasurement(six));

  // Complete multi-speaker sets stay multi.
  const multi = classifySpeakerCardinality(
    [0, 1, 0, 1].map((s, i) => turnPass(s, i)),
    { totalPasses: 4 },
  );
  assert(multi.isMultiSpeaker);
  const multi6 = classifySpeakerCardinality(
    [0, 1, 2, 3, 0, 1].map((s, i) => turnPass(s, i)),
    { totalPasses: 6 },
  );
  assert(multi6.isMultiSpeaker);
});

Deno.test("M — partial set with two distinct speakers already confirms multi", () => {
  const c = classifySpeakerCardinality(
    [turnPass(0, 0), turnPass(1, 1)],
    { totalPasses: 6 },
  );
  assert(c.isMultiSpeaker);
  assertFalse(c.passSetComplete);
  assert(shouldRunMultiSpeakerMotionMeasurement(c));
});

// ── FA-4 v409 Residual — Measurement-Missing-Race ────────────────────────────

Deno.test("N — incomplete one-pass set defers measurement (not multi, not single)", () => {
  const c = classifySpeakerCardinality([{ speaker_idx: 0, job_id: "j0" }], { totalPasses: 4 });
  assert(isIncompleteSpeakerPassSet(c));
  assert(shouldDeferSpeakerMeasurement(c));
  assertFalse(c.isMultiSpeaker);
  assertFalse(c.isSingleSpeaker);
  assertEquals(planPreLockSpeakerMeasurement(c).action, "defer");
});

Deno.test("N2 — missing speaker_idx unknown is NOT an incomplete pass set", () => {
  const c = classifySpeakerCardinality([{ job_id: "a" }, { job_id: "b" }], { totalPasses: 2 });
  assert(c.isUnknown);
  assert(c.passSetComplete);
  assertFalse(isIncompleteSpeakerPassSet(c));
  assertFalse(shouldDeferSpeakerMeasurement(c));
  assertEquals(planPreLockSpeakerMeasurement(c).action, "skip");
});

Deno.test("O — complete single two/six turn: no measurement pre-lock or under lock", () => {
  for (const n of [2, 6]) {
    const c = classifySpeakerCardinality(
      Array.from({ length: n }, (_, i) => turnPass(0, i)),
      { totalPasses: n },
    );
    assert(c.isSingleSpeaker);
    assertEquals(planPreLockSpeakerMeasurement(c).action, "skip");
    assertEquals(
      planUnderLockSpeakerMeasurement({ fresh: c, preLockDeferred: true, hasMeasurement: false })
        .action,
      "skip",
    );
  }
});

Deno.test("P — complete multi requires measurement pre-lock", () => {
  const c = classifySpeakerCardinality(
    [0, 1, 0, 1].map((s, i) => turnPass(s, i)),
    { totalPasses: 4 },
  );
  assertEquals(planPreLockSpeakerMeasurement(c).action, "measure");
});

Deno.test("Q — deferred pre-lock + fresh multi → catch-up measurement, not measurement_missing", () => {
  const snap = classifySpeakerCardinality([{ speaker_idx: 0, job_id: "j0" }], { totalPasses: 4 });
  const deferred = planPreLockSpeakerMeasurement(snap).action === "defer";
  assert(deferred);
  const fresh = classifySpeakerCardinality(
    [0, 1, 0, 1].map((s, i) => turnPass(s, i)),
    { totalPasses: 4 },
  );
  assert(fresh.isMultiSpeaker);
  const plan = planUnderLockSpeakerMeasurement({
    fresh,
    preLockDeferred: deferred,
    hasMeasurement: false,
  });
  assertEquals(plan.action, "measure");

  // Already measured pre-lock → never measured twice.
  assertEquals(
    planUnderLockSpeakerMeasurement({ fresh, preLockDeferred: deferred, hasMeasurement: true })
      .action,
    "skip",
  );
});

Deno.test("R — deferred pre-lock + still incomplete fresh state stays fail-closed", () => {
  const fresh = classifySpeakerCardinality([{ speaker_idx: 0, job_id: "j0" }], { totalPasses: 4 });
  assertEquals(
    planUnderLockSpeakerMeasurement({ fresh, preLockDeferred: true, hasMeasurement: false }).action,
    "skip",
  );
  const d = decideCompletedSpeakerBranch(fresh);
  assertEquals(d.branch, "fail_closed");
  assertEquals((d as { errorText: string }).errorText, SPEAKER_CARDINALITY_INDETERMINATE_ERROR);
});
