// FA-4 v409 — ausführbare Tests für die Speaker-Cardinality-Klassifikation.
// Keine Source-String-Assertions: alle Fälle rufen die echten, in der
// Produktion (sync-so-webhook) verwendeten PURE-Helper auf.
import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  classifySpeakerCardinality,
  decideCompletedSpeakerBranch,
  distinctSpeakerIndices,
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
    assertEquals((d as { writeId: string }).writeId, "ssw:failed");
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
