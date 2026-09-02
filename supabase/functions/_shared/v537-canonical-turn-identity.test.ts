/**
 * V537 — CANONICAL TURN IDENTITY MATERIALIZATION.
 *
 * Acceptance test N2-02 ("Visual Order Swap", scene 7aa7fc93, run 7bcb9442)
 * was blocked pre-dispatch by `fa4_p0_turn_pass_mismatch`:
 *
 *     turn_backed_count   = 4
 *     canonical_turns     = 1
 *     null_segment_pass_idx = [1,2,3]
 *
 * The scene had four turns with four ids. After reconciliation one survived,
 * and `audio_plan.twoshot.segments[].turn_id` mirrored the loss exactly.
 *
 * `alignDialogTurnsToScript` returns `turnId: undefined` for any output turn
 * that may not inherit a prior identity — that decision is correct and stays.
 * What was missing is the mint: the only `crypto.randomUUID()` in the repo
 * lives in `ensureDialogTurnsForScene`, which returns early whenever the
 * scene already has a turn.
 *
 * The historical divergence branch is established (`after = 4`), but the
 * console line that would name `reason` and `before` is no longer available.
 * Both shapes are therefore tested: CASE A (count mismatch, base = 1) is the
 * strongest surviving inference, CASE B (speaker mismatch, base = 4) cannot
 * be formally excluded. Neither is claimed as proven.
 */
import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  describeTurnIdViolation,
  isCanonicalTurnId,
  materializeCanonicalTurnIds,
  readTurnId,
  TURN_ID_UUID_RE,
  readFrozenCanonicalTurnIds,
  validateCanonicalTurnIds,
} from "./canonical-turn-identity.ts";
import {
  alignDialogTurnsToScript,
  normalizeDialogTurns,
  resolveEffectiveDialog,
  type CanonicalTurn,
} from "./resolve-effective-dialog.ts";
import { normalizeTurns } from "./scene-dialog-turns.ts";
import { evaluateTurnPassBinding } from "./fa4-turn-pass-guard.ts";

// ── A deterministic generator, so nothing here depends on randomness ──────

function mintCounter(prefix = "aaaaaaaa") {
  let n = 0;
  const calls: string[] = [];
  const mint = () => {
    n += 1;
    const id = `${prefix}-0000-4000-8000-${String(n).padStart(12, "0")}`;
    calls.push(id);
    return id;
  };
  return { mint, calls, get count() { return n; } };
}

const SAMUEL = "11111111-1111-4111-8111-111111111111";
const SARAH = "22222222-2222-4222-8222-222222222222";
const MATTHEW = "33333333-3333-4333-8333-333333333333";
const KAY = "44444444-4444-4444-8444-444444444444";

const U = (n: number) => `deadbeef-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** The N2-02 cast order: Samuel, Sarah, Samuel, Sarah. */
function n2_02Turns(): CanonicalTurn[] {
  return [
    { turnId: U(1), characterId: SAMUEL, text: "Line one", order: 0 },
    { turnId: U(2), characterId: SARAH, text: "Line two", order: 1 },
    { turnId: U(3), characterId: SAMUEL, text: "Line three", order: 2 },
    { turnId: U(4), characterId: SARAH, text: "Line four", order: 3 },
  ];
}

const N2_02_SCRIPT = [
  "Samuel: Line one",
  "Sarah: Line two",
  "Samuel: Line three",
  "Sarah: Line four",
].join("\n");

const CAST = new Map([
  ["samuel", { id: SAMUEL, name: "Samuel" }],
  ["sarah", { id: SARAH, name: "Sarah" }],
  ["matthew", { id: MATTHEW, name: "Matthew" }],
  ["kay", { id: KAY, name: "Kay" }],
]);
const resolveSpeakerId = (name: string) => CAST.get(name.trim().toLowerCase()) ?? null;

// ─────────────────────────────────────────────────────────────────────
// The contract itself.
// ─────────────────────────────────────────────────────────────────────

Deno.test("V537 — an already valid, unique set is returned untouched and mints nothing", () => {
  const turns = n2_02Turns();
  const g = mintCounter();
  const r = materializeCanonicalTurnIds(turns, g.mint);
  assertEquals(g.count, 0, "the generator must not be called");
  assertEquals(r.minted, 0);
  assertEquals(r.preserved, 4);
  assertEquals(r.replaced, 0);
  assertEquals(r.turns.map((t) => t.turnId), [U(1), U(2), U(3), U(4)]);
  // Idempotent a second time, with a fresh generator.
  const g2 = mintCounter("bbbbbbbb");
  const r2 = materializeCanonicalTurnIds(r.turns, g2.mint);
  assertEquals(g2.count, 0);
  assertEquals(r2.turns.map((t) => t.turnId), r.turns.map((t) => t.turnId));
});

Deno.test("V537 — the input is never mutated", () => {
  const turns = [{ characterId: SAMUEL, text: "x", order: 0 }] as CanonicalTurn[];
  const before = JSON.stringify(turns);
  materializeCanonicalTurnIds(turns, mintCounter().mint);
  assertEquals(JSON.stringify(turns), before);
});

Deno.test("V537 — missing, invalid and duplicate ids are all repaired", () => {
  const g = mintCounter();
  const r = materializeCanonicalTurnIds(
    [
      { turnId: U(1), characterId: SAMUEL, text: "a", order: 0 }, // valid
      { characterId: SARAH, text: "b", order: 1 }, // missing
      { turnId: "not-a-uuid", characterId: SAMUEL, text: "c", order: 2 }, // invalid
      { turnId: U(1), characterId: SARAH, text: "d", order: 3 }, // duplicate
    ] as CanonicalTurn[],
    g.mint,
  );
  assertEquals(r.preserved, 1, "only the first valid id survives");
  assertEquals(r.minted, 3);
  assertEquals(r.replaced, 2, "invalid and duplicate count as replaced, missing does not");
  assertEquals(r.mintedIdx, [1, 2, 3]);
  assertEquals(r.turns[0].turnId, U(1), "FIRST occurrence keeps the contested id");
  assertNotEquals(r.turns[3].turnId, U(1));
  assert(validateCanonicalTurnIds(r.turns).ok);
});

Deno.test("V537 — legacy snake_case turn_id is read and canonicalized to one spelling", () => {
  const g = mintCounter();
  const r = materializeCanonicalTurnIds(
    [{ turn_id: U(7), characterId: SAMUEL, text: "a", order: 0 }] as never,
    g.mint,
  );
  assertEquals(g.count, 0, "a valid legacy id is an identity, not a defect");
  assertEquals(r.turns[0].turnId, U(7));
  assertEquals((r.turns[0] as Record<string, unknown>).turn_id, undefined, "one spelling survives");
  assertEquals(readTurnId({ turn_id: U(7) }), U(7));
  assertEquals(readTurnId({ turnId: U(8), turn_id: U(9) }), U(8), "camelCase wins when both exist");
});

Deno.test("V537 — validation separates missing from invalid from duplicate", () => {
  const report = validateCanonicalTurnIds([
    { turnId: U(1) },
    {},
    { turnId: "nope" },
    { turnId: U(1) },
    { turnId: "" },
  ]);
  assertEquals(report.ok, false);
  assertEquals(report.missingIdx, [1, 4], "absent and empty-string are both 'missing'");
  assertEquals(report.invalidIdx, [2]);
  assertEquals(report.duplicateIdx, [3]);
  assertEquals(report.duplicateIds, [U(1)]);
  assertEquals(report.checked, 5);

  const detail = describeTurnIdViolation(report)!;
  assert(detail.startsWith("canonical_turn_id_violation:"));
  assert(detail.includes("missing=[1,4]") && detail.includes("invalid=[2]") && detail.includes("duplicate=[3]"));
  // Bounded and scalar: no text, no character id, no url.
  for (const leak of ["Line", SAMUEL, "http", "characterId"]) {
    assert(!detail.includes(leak), `violation detail must not carry ${leak}`);
  }
  assertEquals(describeTurnIdViolation(validateCanonicalTurnIds([{ turnId: U(1) }])), null);
  assertEquals(validateCanonicalTurnIds([]).ok, true, "an empty list is a different condition");
});

Deno.test("V537 — the id predicate accepts only real UUIDs", () => {
  assert(isCanonicalTurnId(U(1)));
  assert(isCanonicalTurnId(U(1).toUpperCase()));
  for (const bad of ["", "  ", "not-a-uuid", 42, null, undefined, `${U(1)}x`, U(1).slice(0, -1)]) {
    assertEquals(isCanonicalTurnId(bad), false, `${String(bad)} must be rejected`);
  }
  assert(TURN_ID_UUID_RE.test(U(1)));
});

// ─────────────────────────────────────────────────────────────────────
// N2-02 — both possible divergence shapes.
// ─────────────────────────────────────────────────────────────────────

Deno.test("N2-02 CASE A — count mismatch, base = 1 script = 4", () => {
  // The strongest surviving inference: only one turn reached the aligner, so
  // `base` was undefined for indices 1..3 and `keepsIdentity` was false by
  // construction — which is exactly null_segment_pass_idx = [1,2,3].
  const base = [n2_02Turns()[0]];
  const effective = resolveEffectiveDialog(
    { dialogScript: N2_02_SCRIPT, dialogTurns: base },
    { resolveSpeakerId },
  );
  assertEquals(effective.diverged, true);
  assertEquals(effective.reason, "count_mismatch");
  assertEquals(effective.turns.length, 4);
  // The pre-V537 shape, reproduced.
  assertEquals(
    effective.turns.map((t) => t.turnId ?? null),
    [U(1), null, null, null],
    "this is the shipped failure",
  );

  const g = mintCounter();
  const r = materializeCanonicalTurnIds(effective.turns, g.mint);
  assertEquals(r.turns.length, 4);
  assertEquals(r.turns[0].turnId, U(1), "turn 0 keeps its original id byte-for-byte");
  assertEquals(r.minted, 3);
  assertEquals(r.mintedIdx, [1, 2, 3]);
  const report = validateCanonicalTurnIds(r.turns);
  assertEquals(report.ok, true);
  assertEquals(new Set(r.turns.map((t) => t.turnId)).size, 4, "unique");
});

Deno.test("N2-02 CASE B — speaker mismatch, base = 4", () => {
  // Cannot be formally excluded from surviving evidence, so it must also work:
  // reassigned turns lose their identity and receive a NEW one; unchanged
  // turns keep theirs.
  const base = n2_02Turns();
  const swapped = [
    "Sarah: Line one", // reassigned
    "Sarah: Line two", // unchanged
    "Samuel: Line three", // unchanged
    "Samuel: Line four", // reassigned
  ].join("\n");
  const effective = resolveEffectiveDialog(
    { dialogScript: swapped, dialogTurns: base },
    { resolveSpeakerId },
  );
  assertEquals(effective.diverged, true);
  assertEquals(effective.reason, "speaker_mismatch");
  assertEquals(
    effective.turns.map((t) => t.turnId ?? null),
    [null, U(2), U(3), null],
    "only the reassigned turns lose identity",
  );

  const g = mintCounter();
  const r = materializeCanonicalTurnIds(effective.turns, g.mint);
  assertEquals(r.turns[1].turnId, U(2), "unchanged logical turn keeps its id");
  assertEquals(r.turns[2].turnId, U(3));
  assertEquals(r.mintedIdx, [0, 3]);
  assert(r.turns[0].turnId !== U(1), "a reassigned turn does NOT inherit the old id");
  assert(r.turns[3].turnId !== U(4));
  assertEquals(validateCanonicalTurnIds(r.turns).ok, true);
});

// ─────────────────────────────────────────────────────────────────────
// End-to-end: materialization → persistence payload → audio plan → FA-4.
// ─────────────────────────────────────────────────────────────────────

/** Mirrors `blocksFromDialogTurns` + the segments loop, on turn identity only. */
function audioPlanSegments(turns: Array<{ turnId?: string; characterId: string; text: string }>) {
  return turns
    .filter((t) => t.characterId && t.text)
    .map((t, i) => ({ idx: i, turn_id: t.turnId ? String(t.turnId) : null }));
}

Deno.test("N2-02 END-TO-END — materialization survives into FA-4", () => {
  const base = [n2_02Turns()[0]]; // CASE A shape
  const effective = resolveEffectiveDialog(
    { dialogScript: N2_02_SCRIPT, dialogTurns: base },
    { resolveSpeakerId },
  );
  const g = mintCounter();
  const persistPayload = materializeCanonicalTurnIds(
    effective.turns.map((t, i) => ({
      turnId: t.turnId,
      characterId: t.characterId,
      displayName: t.displayName,
      text: t.text,
      mood: t.mood,
      order: i,
    })),
    g.mint,
  ).turns;

  // 1. dialog turns
  assertEquals(persistPayload.length, 4);
  assertEquals(validateCanonicalTurnIds(persistPayload).ok, true);
  const canonicalIds = persistPayload.map((t) => t.turnId!);
  assertEquals(new Set(canonicalIds).size, 4);

  // 2. the server re-read of the very same payload (compose-twoshot-audio:773)
  const reRead = normalizeTurns(persistPayload);
  assertEquals(reRead.length, 4, "the strict server normalizer keeps all four");
  assertEquals(reRead.map((t) => t.turnId), canonicalIds);

  // 3. audio plan segments
  const segments = audioPlanSegments(reRead as never);
  assertEquals(segments.length, 4);
  assertEquals(segments.filter((s) => s.turn_id !== null).length, 4);
  assertEquals(
    new Set(segments.map((s) => s.turn_id)),
    new Set(canonicalIds),
    "segment ids ARE the canonical turn ids",
  );

  // 4. FA-4
  const fa4 = evaluateTurnPassBinding(
    segments.map((s) => ({ idx: s.idx, segment_id: s.turn_id })),
    canonicalIds,
  );
  assertEquals(fa4.turn_backed_count, 4);
  assertEquals(fa4.canonical_turns, 4);
  assertEquals(fa4.null_segment_pass_idx, []);
  assertEquals(fa4.foreign_segment_ids, []);
  assertEquals(fa4.duplicate_segment_ids, []);
  assertEquals(fa4.missing_turn_ids, []);
  assertEquals(fa4.ok, true);
});

Deno.test("N2-02 END-TO-END — the pre-V537 payload still fails FA-4 exactly as reported", () => {
  const base = [n2_02Turns()[0]];
  const effective = resolveEffectiveDialog(
    { dialogScript: N2_02_SCRIPT, dialogTurns: base },
    { resolveSpeakerId },
  );
  const legacy = effective.turns.map((t, i) => ({
    turnId: t.turnId,
    characterId: t.characterId,
    text: t.text,
    order: i,
  }));
  const segments = audioPlanSegments(legacy as never);
  const canonicalIds = legacy.map((t) => t.turnId).filter((v): v is string => !!v);
  const fa4 = evaluateTurnPassBinding(
    segments.map((s) => ({ idx: s.idx, segment_id: s.turn_id })),
    canonicalIds,
  );
  assertEquals(fa4.ok, false);
  assertEquals(fa4.turn_backed_count, 4);
  assertEquals(fa4.canonical_turns, 1);
  assertEquals(fa4.null_segment_pass_idx, [1, 2, 3], "the production evidence, reproduced");
  assertEquals(fa4.foreign_segment_ids, []);
  assertEquals(fa4.duplicate_segment_ids, []);
  assertEquals(fa4.missing_turn_ids, []);
});

// ─────────────────────────────────────────────────────────────────────
// The RCA matrix.
// ─────────────────────────────────────────────────────────────────────

function runThrough(turns: CanonicalTurn[], script: string) {
  const effective = resolveEffectiveDialog({ dialogScript: script, dialogTurns: turns }, { resolveSpeakerId });
  const g = mintCounter();
  const r = materializeCanonicalTurnIds(effective.turns, g.mint);
  return { effective, result: r, mints: g.count };
}

Deno.test("MATRIX — unchanged dialog preserves every id and mints nothing", () => {
  const { effective, result, mints } = runThrough(n2_02Turns(), N2_02_SCRIPT);
  assertEquals(effective.diverged, false);
  assertEquals(effective.reason, "in_sync");
  assertEquals(mints, 0);
  assertEquals(result.turns.map((t) => t.turnId), [U(1), U(2), U(3), U(4)]);
});

Deno.test("MATRIX — a new line is minted, the existing four are preserved", () => {
  const script = `${N2_02_SCRIPT}\nSamuel: Line five`;
  const { result } = runThrough(n2_02Turns(), script);
  assertEquals(result.turns.length, 5);
  assertEquals(result.turns.slice(0, 4).map((t) => t.turnId), [U(1), U(2), U(3), U(4)]);
  assertEquals(result.mintedIdx, [4]);
  assertEquals(validateCanonicalTurnIds(result.turns).ok, true);
});

Deno.test("MATRIX — a removed line drops its turn, the rest keep their ids", () => {
  const script = ["Samuel: Line one", "Sarah: Line two", "Samuel: Line three"].join("\n");
  const { result, mints } = runThrough(n2_02Turns(), script);
  assertEquals(result.turns.length, 3);
  assertEquals(result.turns.map((t) => t.turnId), [U(1), U(2), U(3)]);
  assertEquals(mints, 0);
});

Deno.test("MATRIX — a reorder that changes speakers mints for the changed positions only", () => {
  const script = ["Sarah: Line two", "Samuel: Line one", "Samuel: Line three", "Sarah: Line four"].join("\n");
  const { result } = runThrough(n2_02Turns(), script);
  assertEquals(result.turns.length, 4);
  // Positions 0 and 1 changed speaker → new ids; 2 and 3 did not → preserved.
  assertEquals(result.turns[2].turnId, U(3));
  assertEquals(result.turns[3].turnId, U(4));
  assertEquals(result.mintedIdx, [0, 1]);
  assertEquals(validateCanonicalTurnIds(result.turns).ok, true);
});

Deno.test("MATRIX — duplicate text on the same speaker keeps distinct identities", () => {
  const turns: CanonicalTurn[] = [
    { turnId: U(1), characterId: SAMUEL, text: "Same line", order: 0 },
    { turnId: U(2), characterId: SARAH, text: "Other", order: 1 },
    { turnId: U(3), characterId: SAMUEL, text: "Same line", order: 2 },
  ];
  const script = ["Samuel: Same line", "Sarah: Other", "Samuel: Same line"].join("\n");
  const { result, mints } = runThrough(turns, script);
  assertEquals(mints, 0);
  assertEquals(result.turns.map((t) => t.turnId), [U(1), U(2), U(3)]);
  assertEquals(new Set(result.turns.map((t) => t.turnId)).size, 3);
});

Deno.test("MATRIX — the same speaker on non-adjacent turns keeps separate ids", () => {
  const turns: CanonicalTurn[] = [
    { turnId: U(1), characterId: SAMUEL, text: "A", order: 0 },
    { turnId: U(2), characterId: SARAH, text: "B", order: 1 },
    { turnId: U(3), characterId: SAMUEL, text: "C", order: 2 },
    { turnId: U(4), characterId: MATTHEW, text: "D", order: 3 },
    { turnId: U(5), characterId: SAMUEL, text: "E", order: 4 },
  ];
  const script = ["Samuel: A", "Sarah: B", "Samuel: C", "Matthew: D", "Samuel: E"].join("\n");
  const { result, mints } = runThrough(turns, script);
  assertEquals(mints, 0);
  assertEquals(new Set(result.turns.map((t) => t.turnId)).size, 5);
});

for (
  const [label, cast, lines] of [
    ["1-speaker multi-turn", [SAMUEL, SAMUEL, SAMUEL], ["Samuel: A", "Samuel: B", "Samuel: C"]],
    ["2-speaker alternating", [SAMUEL, SARAH, SAMUEL, SARAH], ["Samuel: A", "Sarah: B", "Samuel: C", "Sarah: D"]],
    ["3-speaker", [SAMUEL, SARAH, MATTHEW], ["Samuel: A", "Sarah: B", "Matthew: C"]],
    ["4-speaker", [SAMUEL, SARAH, MATTHEW, KAY], ["Samuel: A", "Sarah: B", "Matthew: C", "Kay: D"]],
  ] as const
) {
  Deno.test(`MATRIX — ${label}: every turn ends with a unique id`, () => {
    const turns: CanonicalTurn[] = cast.map((cid, i) => ({
      characterId: cid,
      text: lines[i].split(": ")[1],
      order: i,
    }));
    const { result } = runThrough(turns, lines.join("\n"));
    assertEquals(result.turns.length, cast.length);
    assertEquals(validateCanonicalTurnIds(result.turns).ok, true);
    assertEquals(new Set(result.turns.map((t) => t.turnId)).size, cast.length);
    // No speaker-count special case exists anywhere in the contract.
    const SRC = Deno.readTextFileSync(new URL("./canonical-turn-identity.ts", import.meta.url));
    assert(!/speaker/i.test(SRC.replace(/\/\*\*[\s\S]*?\*\//g, "")), "no speaker logic in the contract");
  });
}

// ─────────────────────────────────────────────────────────────────────
// The legacy asymmetry, and the freeze.
// ─────────────────────────────────────────────────────────────────────

Deno.test("V537 — the server normalizer now reads legacy snake_case turn_id", () => {
  const rows = [
    { turnId: U(1), characterId: SAMUEL, text: "a" },
    { turn_id: U(2), characterId: SARAH, text: "b" },
  ];
  const server = normalizeTurns(rows);
  assertEquals(server.map((t) => t.turnId), [U(1), U(2)], "both spellings survive");
  // And the client normalizer already did — the two now agree.
  const client = normalizeDialogTurns(rows);
  assertEquals(client.map((t) => t.turnId), [U(1), U(2)]);
});

Deno.test("FREEZE — alignDialogTurnsToScript still refuses to inherit across a reassignment", () => {
  const out = alignDialogTurnsToScript({
    turns: [{ turnId: U(1), characterId: SAMUEL, text: "a", order: 0 }],
    script: "Sarah: a",
    resolveSpeakerId,
  })!;
  assertEquals(out.length, 1);
  assertEquals(out[0].characterId, SARAH);
  assertEquals(out[0].turnId, undefined, "the aligner's decision is untouched");

  const SRC = Deno.readTextFileSync(new URL("./resolve-effective-dialog.ts", import.meta.url));
  assert(SRC.includes("turnId: keepsIdentity ? base?.turnId : undefined,"), "byte-identical decision");
  assert(!SRC.includes("randomUUID"), "the pure contract stays deterministic");
  assert(!SRC.includes("v537"), "no V537 code leaked into the aligner");
});

Deno.test("FREEZE — FA-4 remains fail-closed and unchanged", () => {
  const SRC = Deno.readTextFileSync(new URL("./fa4-turn-pass-guard.ts", import.meta.url));
  assert(!SRC.includes("v537") && !SRC.includes("V537"), "FA-4 carries no V537 code");
  assert(SRC.includes("turnBacked.length === canonical.length &&"));
  assert(SRC.includes("nullSegmentPassIdx.length === 0 &&"));
  assert(SRC.includes("foreign.length === 0 &&"));
  assert(SRC.includes("duplicates.length === 0 &&"));
  assert(SRC.includes("missing.length === 0 &&"));

  // A null segment id is still refused, with or without V537 upstream.
  const fa4 = evaluateTurnPassBinding(
    [{ idx: 0, segment_id: U(1) }, { idx: 1, segment_id: null }],
    [U(1)],
  );
  assertEquals(fa4.ok, false);
  assertEquals(fa4.null_segment_pass_idx, [1]);
});

Deno.test("FREEZE — the contract module is pure and imports nothing", () => {
  const SRC = Deno.readTextFileSync(new URL("./canonical-turn-identity.ts", import.meta.url));
  // Executable code only: the header prose names randomUUID to explain why it
  // is NOT imported, and matching that would be matching the explanation.
  const code = SRC.replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert(!/^\s*import\s/m.test(code), "no imports at all");
  assert(!code.includes("randomUUID"), "the generator is injected, never imported");
  assert(!/\bfetch\s*\(/.test(code), "no network");
  assert(!/supabase/i.test(code), "no database");
  assert(!/Date\.now|Math\.random/.test(code), "deterministic");
});

Deno.test("PARITY — the client twin is byte-identical", () => {
  const server = Deno.readTextFileSync(new URL("./canonical-turn-identity.ts", import.meta.url));
  const client = Deno.readTextFileSync(
    new URL("../../../src/lib/composer/dialog/canonicalTurnIdentity.ts", import.meta.url),
  );
  assertEquals(server, client, "client and server must never drift");
});

// ─────────────────────────────────────────────────────────────────────
// THE PLAN-IDENTITY FENCE
//
// FA-4 used to compare pass identities frozen in `audio_plan` against
// canonical ids RE-READ from the mutable `dialog_turns` row at dispatch —
// two measurements of two different moments. These pin the snapshot that
// removes the second measurement.
// ─────────────────────────────────────────────────────────────────────

Deno.test("FENCE — absent, present-with-[], present and malformed are four distinct answers", () => {
  assertEquals(readFrozenCanonicalTurnIds(null), { state: "absent" });
  assertEquals(readFrozenCanonicalTurnIds({}), { state: "absent" });
  assertEquals(readFrozenCanonicalTurnIds({ segments: [] } as never), { state: "absent" });
  // An explicit null never made a statement about the run.
  assertEquals(readFrozenCanonicalTurnIds({ canonical_turn_ids: null }), { state: "absent" });

  // [] IS a decision: the run carries no canonical turn identity.
  assertEquals(readFrozenCanonicalTurnIds({ canonical_turn_ids: [] }), { state: "present", ids: [] });
  assertEquals(
    readFrozenCanonicalTurnIds({ canonical_turn_ids: [U(1), U(2)] }),
    { state: "present", ids: [U(1), U(2)] },
  );

  const bad: Array<[unknown, string]> = [
    ["bad", "not_an_array"],
    [42, "not_an_array"],
    [{ a: 1 }, "not_an_array"],
    [[U(1), "nope"], "invalid_at:1"],
    [[U(1), U(1)], "duplicate_at:1"],
    [[U(1), null], "invalid_at:1"],
  ];
  for (const [value, mark] of bad) {
    const r = readFrozenCanonicalTurnIds({ canonical_turn_ids: value });
    assertEquals(r.state, "malformed", `${JSON.stringify(value)} must be malformed`);
    if (r.state === "malformed") assert(r.detail.includes(mark), `${r.detail} should mention ${mark}`);
  }
});

Deno.test("FENCE — a stale client write cannot move the run's identity", () => {
  // 1. materialization
  const base = [n2_02Turns()[0]];
  const effective = resolveEffectiveDialog(
    { dialogScript: N2_02_SCRIPT, dialogTurns: base },
    { resolveSpeakerId },
  );
  const g = mintCounter("aaaaaaaa");
  const persistPayload = materializeCanonicalTurnIds(
    effective.turns.map((t, i) => ({
      turnId: t.turnId,
      characterId: t.characterId,
      text: t.text,
      order: i,
    })),
    g.mint,
  ).turns;
  const A = persistPayload.map((t) => t.turnId!);
  assertEquals(A.length, 4);

  // 2. the audio plan freezes segments AND the identity set, from one source
  const segments = audioPlanSegments(persistPayload as never);
  const plan = { segments, canonical_turn_ids: A };
  assertEquals(segments.map((s) => s.turn_id), A, "one source, two fields");

  // 3. a stale client later overwrites dialog_turns with a different set
  const h = mintCounter("bbbbbbbb");
  const B = materializeCanonicalTurnIds(
    n2_02Turns().map((t) => ({ characterId: t.characterId, text: t.text, order: t.order })),
    h.mint,
  ).turns.map((t) => t.turnId!);
  assertEquals(B.length, 4);
  for (const id of B) assert(!A.includes(id), "the stale write really is a different set");

  // 4. the dispatcher reads the already-built plan
  const frozen = readFrozenCanonicalTurnIds(plan);
  assertEquals(frozen.state, "present");
  if (frozen.state !== "present") return;
  assertEquals(frozen.ids, A, "the run keeps A, not B");

  const fa4 = evaluateTurnPassBinding(
    segments.map((s) => ({ idx: s.idx, segment_id: s.turn_id })),
    frozen.ids,
  );
  assertEquals(fa4.ok, true);
  assertEquals(fa4.turn_backed_count, 4);
  assertEquals(fa4.canonical_turns, 4);
  assertEquals(fa4.null_segment_pass_idx, []);
  assertEquals(fa4.foreign_segment_ids, []);
  assertEquals(fa4.duplicate_segment_ids, []);
  assertEquals(fa4.missing_turn_ids, []);

  // Without the fence the same run would have been blocked.
  const unfenced = evaluateTurnPassBinding(
    segments.map((s) => ({ idx: s.idx, segment_id: s.turn_id })),
    B,
  );
  assertEquals(unfenced.ok, false, "this is what the re-read produced");
  assertEquals(unfenced.foreign_segment_ids.length, 4);
  assertEquals(unfenced.missing_turn_ids.length, 4);
});

Deno.test("FENCE — an empty snapshot is not reinterpreted when dialog_turns fills up later", () => {
  // The run was built with the id-only feature off: no segment carries an id.
  const plan = {
    segments: [{ idx: 0, turn_id: null }, { idx: 1, turn_id: null }],
    canonical_turn_ids: [],
  };
  const frozen = readFrozenCanonicalTurnIds(plan);
  assertEquals(frozen.state, "present");
  if (frozen.state !== "present") return;
  assertEquals(frozen.ids, [], "still empty, however populated dialog_turns has become");

  // FA-4's gate is `canonicalDialogTurnIds.length > 0`, so it stays skipped —
  // consistent with a plan whose segments carry no identity at all.
  assertEquals(frozen.ids.length > 0, false);

  const D = Deno.readTextFileSync(new URL("../compose-dialog-segments/index.ts", import.meta.url));
  assert(D.includes('if (v537Frozen.state === "present") {'), "state-based, not length-based");
  assert(
    !/canonical_turn_ids[\s\S]{0,120}?\.length\s*>\s*0\s*\?/.test(D),
    "no truthiness or length fallback on the snapshot",
  );
});

Deno.test("FENCE — a malformed snapshot fails closed instead of falling back", () => {
  const D = Deno.readTextFileSync(new URL("../compose-dialog-segments/index.ts", import.meta.url));
  const at = D.indexOf('if (v537Frozen.state === "malformed") {');
  assert(at >= 0, "the malformed branch exists");
  // Slice the BRANCH, not a fixed window: a wider slice runs past the
  // `return` into the legacy block and would match its ensure call.
  const branchEnd = D.indexOf("    }", D.indexOf("422,", at));
  const block = D.slice(at, branchEnd);
  assert(block.includes('sync_status: "PREFLIGHT_BLOCKED"'));
  assert(block.includes('error_class: "canonical_turn_snapshot_malformed"'));
  assert(block.includes("422"), "bounded contract error");
  assert(!block.includes("ensureDialogTurnsForScene"), "never falls back to dialog_turns");

  const r = readFrozenCanonicalTurnIds({ canonical_turn_ids: "bad" });
  assertEquals(r.state, "malformed");
  if (r.state !== "malformed") return;
  assert(r.detail.length < 80, "bounded");
  for (const leak of ["http", "Line", "characterId"]) assert(!r.detail.includes(leak));
});

Deno.test("FENCE — an absent snapshot keeps the legacy derivation untouched", () => {
  assertEquals(readFrozenCanonicalTurnIds({ segments: [] } as never).state, "absent");
  const D = Deno.readTextFileSync(new URL("../compose-dialog-segments/index.ts", import.meta.url));
  // The legacy path is unchanged: same flag call, same ensure, same map/filter.
  assert(D.includes("if (await readIdOnlyEnabled(supabase)) {"));
  assert(D.includes("const ensuredTurns = await ensureDialogTurnsForScene(supabase, scene as any);"));
  assert(D.includes("canonicalDialogTurnIds = ensuredTurns.turns"));
  assert(D.includes('.map((t) => (typeof t.turnId === "string" ? t.turnId.trim() : ""))'));
  assert(D.includes(".filter((id) => id.length > 0);"));

  // And the override is narrow: it touches ONLY the FA-4 set.
  const at = D.indexOf('if (v537Frozen.state === "present") {');
  const block = D.slice(at, at + 900);
  assert(block.includes("canonicalDialogTurnIds = v537Frozen.ids;"));
  assert(!block.includes("canonicalSpeakerIds ="), "speaker ordering is untouched");
  assert(!block.includes("speakersSource ="), "the telemetry source is untouched");
  assert(!block.includes("canonicalDialogTurnsCount ="), "the v202 cast guard pair stays consistent");
});

Deno.test("FENCE — segments and the snapshot are written from ONE source", () => {
  const C = Deno.readTextFileSync(new URL("../compose-twoshot-audio/index.ts", import.meta.url));
  // The snapshot is derived from rawTurns, which is exactly what
  // blocksFromDialogTurns consumes to stamp every segment's turn_id.
  assert(C.includes("v537CanonicalTurnIds = rawTurns.map((t) => String(t.turnId));"));
  assert(C.includes(
    "const blocksFromTurns = idOnlyActive ? blocksFromDialogTurns(rawTurns, idOnlyNameById) : null;",
  ));
  assert(C.includes("canonical_turn_ids: v537CanonicalTurnIds,"));

  // Never re-read from the database to build it, never minted a second time.
  const at = C.indexOf("v537CanonicalTurnIds = rawTurns.map");
  assert(at > 0);
  const around = C.slice(Math.max(0, at - 2500), at);
  assert(!around.includes('.select("dialog_turns")'), "no re-read to build the snapshot");
  // Validation runs before the value is assigned.
  assert(C.indexOf("validateCanonicalTurnIds(rawTurns)") < at, "asserted before assignment");
});

Deno.test("FENCE — FA-4 source is still untouched by the fence", () => {
  const SRC = Deno.readTextFileSync(new URL("./fa4-turn-pass-guard.ts", import.meta.url));
  assert(!SRC.includes("canonical_turn_ids"), "FA-4 does not know about the snapshot");
  assert(!SRC.includes("v537") && !SRC.includes("V537"));
  assert(SRC.includes("turnBacked.length === canonical.length &&"));
  assert(SRC.includes("nullSegmentPassIdx.length === 0 &&"));
});
