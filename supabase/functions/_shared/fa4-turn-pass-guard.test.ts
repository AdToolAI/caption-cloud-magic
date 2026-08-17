import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { evaluateTurnPassBinding, isStabilizerPass, type TurnPassCandidate } from "./fa4-turn-pass-guard.ts";

const T = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const STAB = (n: number) => `11111111-1111-5111-8111-11111111000${n}`;

function turnPass(idx: number, segmentId: string | null, speakerIdx = 0): TurnPassCandidate {
  return { idx, segment_id: segmentId, speaker_idx: speakerIdx };
}
function stabilizerPass(idx: number, segmentId: string | null, listenerIdx = 0): TurnPassCandidate {
  return {
    idx,
    segment_id: segmentId,
    speaker_idx: listenerIdx,
    stabilizer_pass: true,
    is_silent_stabilizer: true,
  };
}

Deno.test("N Turns -> N turn-backed Passes, 1:1 segment_id", () => {
  const turns = [T(1), T(2), T(3)];
  const r = evaluateTurnPassBinding(turns.map((id, i) => turnPass(i, id)), turns);
  assertEquals(r.ok, true);
  assertEquals(r.turn_backed_count, 3);
  assertEquals(r.canonical_turns, 3);
});

Deno.test("Wiederholter Sprecher: gleiche speaker_idx, verschiedene segment_id", () => {
  // Sarah spricht Turn 1 und Turn 5 -> zwei Jobs, gleiche Geometrie.
  const turns = [T(1), T(2), T(3), T(4), T(5)];
  const passes = [
    turnPass(0, T(1), 0), // Sarah
    turnPass(1, T(2), 1),
    turnPass(2, T(3), 2),
    turnPass(3, T(4), 3),
    turnPass(4, T(5), 0), // Sarah erneut
  ];
  const r = evaluateTurnPassBinding(passes, turns);
  assertEquals(r.ok, true);
  assertEquals(r.duplicate_segment_ids, []);
  assertEquals(passes[0].segment_id !== passes[4].segment_id, true);
  assertEquals(passes[0].speaker_idx, passes[4].speaker_idx);
});

Deno.test("segment_id = NULL auf turn-backed Pass -> fail-closed", () => {
  const turns = [T(1), T(2)];
  const r = evaluateTurnPassBinding([turnPass(0, T(1)), turnPass(1, null)], turns);
  assertEquals(r.ok, false);
  assertEquals(r.null_segment_pass_idx, [1]);
});

Deno.test("doppelte Turn-ID -> fail-closed", () => {
  const turns = [T(1), T(2)];
  const r = evaluateTurnPassBinding([turnPass(0, T(1)), turnPass(1, T(1))], turns);
  assertEquals(r.ok, false);
  assertEquals(r.duplicate_segment_ids, [T(1)]);
  assertEquals(r.missing_turn_ids, [T(2)]);
});

Deno.test("fremde Turn-ID -> fail-closed", () => {
  const turns = [T(1), T(2)];
  const r = evaluateTurnPassBinding([turnPass(0, T(1)), turnPass(1, T(9))], turns);
  assertEquals(r.ok, false);
  assertEquals(r.foreign_segment_ids, [T(9)]);
});

Deno.test("Anzahl-Mismatch (Passes != dialog_turns) -> fail-closed", () => {
  const turns = [T(1), T(2), T(3)];
  const r = evaluateTurnPassBinding([turnPass(0, T(1)), turnPass(1, T(2))], turns);
  assertEquals(r.ok, false);
  assertEquals(r.turn_backed_count, 2);
  assertEquals(r.missing_turn_ids, [T(3)]);
});

Deno.test("Stabilizer-Regression: 6 Turns + Stabilizer -> genau 6 turn-backed Jobs", () => {
  const turns = [T(1), T(2), T(3), T(4), T(5), T(6)];
  const passes = [
    ...turns.map((id, i) => turnPass(i, id, i % 4)),
    stabilizerPass(6, STAB(0), 0),
    stabilizerPass(7, STAB(1), 1),
    stabilizerPass(8, STAB(2), 2),
    stabilizerPass(9, STAB(3), 3),
  ];
  const r = evaluateTurnPassBinding(passes, turns);
  assertEquals(r.ok, true);
  assertEquals(r.turn_backed_count, 6); // NICHT "6 sync_segment-Rows insgesamt"
  assertEquals(r.stabilizer_count, 4);
  assertEquals(r.stabilizer_turn_id_collisions, []);
  assertEquals(r.missing_turn_ids, []);
});

Deno.test("Stabilizer kollidiert mit Turn-ID -> fail-closed", () => {
  const turns = [T(1), T(2)];
  const r = evaluateTurnPassBinding(
    [turnPass(0, T(1)), turnPass(1, T(2)), stabilizerPass(2, T(1), 0)],
    turns,
  );
  assertEquals(r.ok, false);
  assertEquals(r.stabilizer_turn_id_collisions, [T(1)]);
});

Deno.test("Stabilizer ohne segment_id -> fail-closed", () => {
  const turns = [T(1)];
  const r = evaluateTurnPassBinding([turnPass(0, T(1)), stabilizerPass(1, null, 1)], turns);
  assertEquals(r.ok, false);
  assertEquals(r.stabilizer_null_pass_idx, [1]);
});

Deno.test("Stabilizer-Predicate nutzt beide Produktionsflags", () => {
  assertEquals(isStabilizerPass({ stabilizer_pass: true, is_silent_stabilizer: true }), true);
  assertEquals(isStabilizerPass({ stabilizer_pass: true }), false);
  assertEquals(isStabilizerPass({ is_silent_stabilizer: true }), false);
  // Keine Heuristik über unbekannte segment_id:
  assertEquals(isStabilizerPass({ segment_id: STAB(0) }), false);
});
