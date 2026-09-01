/**
 * V534 — EXHAUSTIVE ANCHOR IDENTITY CLOSURE — focused regression suite.
 *
 * NOTE ON THE GEN33 FIXTURE: the persisted Gen33 row does NOT contain
 * `characterDiagnostics`. The fixture below reconstructs the shape (4/4
 * detected, 3 accepted, Samuel missing) and SETS `bestFaceIndex` to the
 * leftover slot purely to exercise the predicate. That diagnostic value is a
 * FIXTURE, not a persisted Gen33 fact.
 */

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  applyExhaustiveClosure,
  buildV534Telemetry,
  evaluateExhaustiveClosure,
  V534_CLOSURE_LOCK_SOURCE,
} from "./v534-exhaustive-identity-closure.ts";
import {
  buildCanonicalCastRecords,
  evaluateStrictVerification,
  evidenceSatisfiesStrict,
  STRICT_EVIDENCE_CLASSES,
} from "./v508-strict-identity.ts";
import type { RekognitionIdentityResult } from "./resolveIdentityViaRekognition.ts";

const MATTHEW = "54d90504-7253-482f-9c6f-1902e8a6749b";
const SARAH = "5c81f9bf-a5f1-4608-849f-e2a4adc84bcb";
const SAMUEL = "483f9cdc-eb31-4486-bf67-9c5e7d955016";
const KAY = "c65de5c6-75e1-47aa-956c-cd0cc424e736";

const CAST = [
  { characterId: SARAH, speakerIdx: 0 },
  { characterId: SAMUEL, speakerIdx: 1 },
  { characterId: MATTHEW, speakerIdx: 2 },
  { characterId: KAY, speakerIdx: 3 },
];

function diag(characterId: string, over: Record<string, unknown> = {}) {
  return {
    characterId,
    portraitLoaded: true,
    compareAttempted: true,
    compareOk: true,
    bestSimilarity: 90,
    bestFaceIndex: 0,
    accepted: true,
    acceptedFaceIndex: 0,
    acceptedSimilarity: 90,
    reason: "accepted",
    ...over,
  } as RekognitionIdentityResult["characterDiagnostics"] extends Array<infer T> ? T : never;
}

/** Gen33-shaped result: 4 detected, 3 biometrically accepted, Samuel open. */
function gen33(over: Partial<RekognitionIdentityResult> = {}): RekognitionIdentityResult {
  return {
    ok: true,
    method: "aws-rekognition-anchor-v274",
    dims: { width: 704, height: 1520 },
    faces: [
      { slot: 0, bbox: [112, 287, 197, 433], characterId: MATTHEW, similarity: 93.4634 },
      { slot: 1, bbox: [187, 484, 249, 567], characterId: SARAH, similarity: 83.2073 },
      { slot: 2, bbox: [522, 349, 611, 489], characterId: null, similarity: null },
      { slot: 3, bbox: [432, 607, 503, 696], characterId: KAY, similarity: 99.2664 },
    ] as RekognitionIdentityResult["faces"],
    assignmentLock: { "0": SARAH, "2": MATTHEW, "3": KAY },
    resolvedCount: 3,
    expectedCount: 4,
    detectedCount: 4,
    minSimilarity: 83.2073,
    characterDiagnostics: [
      diag(SARAH, { acceptedFaceIndex: 1, bestFaceIndex: 1, bestSimilarity: 83.2073 }),
      // FIXTURE ONLY — Gen33 persisted no diagnostics.
      diag(SAMUEL, {
        accepted: false,
        acceptedFaceIndex: null,
        acceptedSimilarity: null,
        bestFaceIndex: 2,
        bestSimilarity: 41.2,
        reason: "below_threshold",
      }),
      diag(MATTHEW, { acceptedFaceIndex: 0, bestFaceIndex: 0, bestSimilarity: 93.4634 }),
      diag(KAY, { acceptedFaceIndex: 3, bestFaceIndex: 3, bestSimilarity: 99.2664 }),
    ] as RekognitionIdentityResult["characterDiagnostics"],
    msTotal: 1234,
    ...over,
  };
}

function patchDiag(
  res: RekognitionIdentityResult,
  characterId: string,
  over: Record<string, unknown>,
): RekognitionIdentityResult {
  return {
    ...res,
    characterDiagnostics: (res.characterDiagnostics ?? []).map((d) =>
      d.characterId === characterId ? { ...d, ...over } as typeof d : d
    ),
  };
}

const SRC = Deno.readTextFileSync(new URL("./resolveIdentityViaRekognition.ts", import.meta.url));
const V508SRC = Deno.readTextFileSync(new URL("./v508-strict-identity.ts", import.meta.url));
const CLIPS = Deno.readTextFileSync(
  new URL("../compose-video-clips/index.ts", import.meta.url),
);

// ── A. THE CLOSURE ITSELF ──────────────────────────────────────────────────

Deno.test("A. Gen33-shaped: closure fires on the sole leftover face", () => {
  const d = evaluateExhaustiveClosure(gen33(), CAST);
  assertEquals(d.applied, true);
  assertEquals(d.reason, "closed");
  assertEquals(d.closure?.characterId, SAMUEL);
  assertEquals(d.closure?.faceIndex, 2);
  assertEquals(d.closure?.speakerIdx, 1);
  assertEquals(d.closure?.source, V534_CLOSURE_LOCK_SOURCE);
});

Deno.test("B. applying the closure places exactly one identity", () => {
  const base = gen33();
  const d = evaluateExhaustiveClosure(base, CAST);
  const out = applyExhaustiveClosure(base, d.closure!);
  assertEquals(out.faces.filter((f) => f.characterId).length, 4);
  assertEquals(out.faces[2].characterId, SAMUEL);
  assertEquals(Object.keys(out.assignmentLock).sort(), ["0", "1", "2", "3"]);
  assertEquals(out.assignmentLock["1"], SAMUEL);
});

Deno.test("C. never overwrites an accepted biometric identity", () => {
  const base = gen33();
  const out = applyExhaustiveClosure(base, evaluateExhaustiveClosure(base, CAST).closure!);
  assertEquals(out.faces[0].characterId, MATTHEW);
  assertEquals(out.faces[1].characterId, SARAH);
  assertEquals(out.faces[3].characterId, KAY);
  assertEquals(out.assignmentLock["0"], SARAH);
  assertEquals(out.assignmentLock["2"], MATTHEW);
  assertEquals(out.assignmentLock["3"], KAY);
  // Similarity of accepted faces untouched.
  assertEquals(out.faces[0].similarity, 93.4634);
});

Deno.test("D. V534 adds AT MOST one identity — a second call is a no-op refusal", () => {
  const base = gen33();
  const once = applyExhaustiveClosure(base, evaluateExhaustiveClosure(base, CAST).closure!);
  const twice = evaluateExhaustiveClosure(once, CAST);
  assertEquals(twice.applied, false);
  assertEquals(twice.reason, "unassigned_face_count_not_one");
});

Deno.test("E. provenance: lock may reach 4 entries while resolvedCount stays 3", () => {
  const base = gen33();
  const out = applyExhaustiveClosure(base, evaluateExhaustiveClosure(base, CAST).closure!);
  assertEquals(out.resolvedCount, 3, "resolvedCount counts BIOMETRIC resolutions only");
  assertEquals(Object.keys(out.assignmentLock).length, 4);
  assertEquals(out.expectedCount, 4);
});

// ── F. COUNT / SHAPE REFUSALS ──────────────────────────────────────────────

Deno.test("F. 4 detected / 2 resolved => refuse", () => {
  const r = gen33({
    faces: [
      { slot: 0, bbox: [0, 0, 1, 1], characterId: MATTHEW, similarity: 93 },
      { slot: 1, bbox: [0, 0, 1, 1], characterId: null, similarity: null },
      { slot: 2, bbox: [0, 0, 1, 1], characterId: null, similarity: null },
      { slot: 3, bbox: [0, 0, 1, 1], characterId: KAY, similarity: 99 },
    ] as RekognitionIdentityResult["faces"],
    assignmentLock: { "2": MATTHEW, "3": KAY },
    resolvedCount: 2,
  });
  assertEquals(evaluateExhaustiveClosure(r, CAST).reason, "resolved_count_not_n_minus_one");
});

Deno.test("G. under-detection (3 detected / 4 expected) => refuse", () => {
  const r = gen33({ detectedCount: 3 });
  assertEquals(evaluateExhaustiveClosure(r, CAST).reason, "detected_count_mismatch");
});

Deno.test("G2. over-detection (5 detected / 4 expected) => refuse", () => {
  const r = gen33({ detectedCount: 5 });
  assertEquals(evaluateExhaustiveClosure(r, CAST).reason, "detected_count_mismatch");
});

Deno.test("G3. detectedCount missing entirely => refuse", () => {
  const r = gen33({ detectedCount: undefined });
  assertEquals(evaluateExhaustiveClosure(r, CAST).reason, "detected_count_mismatch");
});

Deno.test("H. faces array shorter than expectedCount => refuse", () => {
  const base = gen33();
  const r = { ...base, faces: base.faces.slice(0, 3) };
  assertEquals(evaluateExhaustiveClosure(r, CAST).reason, "face_count_mismatch");
});

Deno.test("I. two unassigned faces => refuse", () => {
  const base = gen33();
  const faces = base.faces.map((f, i) => (i === 3 ? { ...f, characterId: null, similarity: null } : f));
  const r = { ...base, faces };
  assertEquals(evaluateExhaustiveClosure(r, CAST).applied, false);
});

Deno.test("J. two missing characters => refuse", () => {
  const base = gen33();
  const faces = base.faces.map((f, i) => (i === 3 ? { ...f, characterId: null, similarity: null } : f));
  const r = {
    ...base,
    faces,
    assignmentLock: { "0": SARAH, "2": MATTHEW },
    resolvedCount: 2,
  };
  assertEquals(evaluateExhaustiveClosure(r, CAST).applied, false);
});

Deno.test("K. cohort of one can never close", () => {
  const r = gen33({
    expectedCount: 1,
    detectedCount: 1,
    resolvedCount: 0,
    faces: [{ slot: 0, bbox: [0, 0, 1, 1], characterId: null, similarity: null }] as RekognitionIdentityResult["faces"],
    assignmentLock: {},
  });
  assertEquals(evaluateExhaustiveClosure(r, [{ characterId: SAMUEL, speakerIdx: 0 }]).reason, "cohort_too_small");
});

Deno.test("L. complete native 4/4 => no-op", () => {
  const base = gen33();
  const faces = base.faces.map((f, i) => (i === 2 ? { ...f, characterId: SAMUEL, similarity: 71 } : f));
  const r = {
    ...base,
    faces,
    assignmentLock: { "0": SARAH, "1": SAMUEL, "2": MATTHEW, "3": KAY },
    resolvedCount: 4,
  };
  const d = evaluateExhaustiveClosure(r, CAST);
  assertEquals(d.applied, false);
  assertEquals(d.reason, "resolved_count_not_n_minus_one");
});

Deno.test("M. total miss 0/4 => refuse", () => {
  const base = gen33();
  const r = {
    ...base,
    faces: base.faces.map((f) => ({ ...f, characterId: null, similarity: null })),
    assignmentLock: {},
    resolvedCount: 0,
  };
  assertEquals(evaluateExhaustiveClosure(r, CAST).applied, false);
});

Deno.test("N. accepted face set and lock set must agree", () => {
  // Lock names a character the faces do not carry.
  const r = gen33({ assignmentLock: { "0": SARAH, "2": MATTHEW, "3": SAMUEL } });
  assertEquals(evaluateExhaustiveClosure(r, CAST).reason, "accepted_sets_inconsistent");
});

Deno.test("N2. non-injective accepted faces => refuse", () => {
  const base = gen33();
  const faces = base.faces.map((f, i) => (i === 3 ? { ...f, characterId: MATTHEW } : f));
  const r = { ...base, faces };
  assertEquals(evaluateExhaustiveClosure(r, CAST).applied, false);
});

// ── DIAGNOSTIC REFUSALS ────────────────────────────────────────────────────

Deno.test("O0. diagnostics missing entirely => refuse", () => {
  const r = gen33({ characterDiagnostics: undefined });
  assertEquals(evaluateExhaustiveClosure(r, CAST).reason, "diagnostics_missing");
});

Deno.test("O1. portrait_load_failed => refuse", () => {
  const r = patchDiag(gen33(), SAMUEL, { portraitLoaded: false, reason: "portrait_load_failed" });
  assertEquals(evaluateExhaustiveClosure(r, CAST).reason, "portrait_load_failed");
});

Deno.test("O2a. compare not attempted => refuse", () => {
  const r = patchDiag(gen33(), SAMUEL, { compareAttempted: false });
  assertEquals(evaluateExhaustiveClosure(r, CAST).reason, "compare_not_attempted");
});

Deno.test("O2b. compareOk false => refuse", () => {
  const r = patchDiag(gen33(), SAMUEL, { compareOk: false, reason: "compare_failed" });
  assertEquals(evaluateExhaustiveClosure(r, CAST).reason, "compare_failed");
});

Deno.test("O2c. compare flags missing => refuse", () => {
  const r = patchDiag(gen33(), SAMUEL, { compareOk: undefined, compareAttempted: undefined });
  assertEquals(evaluateExhaustiveClosure(r, CAST).applied, false);
});

Deno.test("O3. per-character no_faces_detected => refuse", () => {
  const r = patchDiag(gen33(), SAMUEL, { reason: "no_faces_detected" });
  assertEquals(evaluateExhaustiveClosure(r, CAST).reason, "diagnostic_reason_refused");
});

Deno.test("O4. per-character ambiguous => refuse", () => {
  const r = patchDiag(gen33(), SAMUEL, { reason: "ambiguous" });
  assertEquals(evaluateExhaustiveClosure(r, CAST).reason, "diagnostic_reason_refused");
});

Deno.test("O5. per-character assignment_budget_exceeded => refuse", () => {
  const r = patchDiag(gen33(), SAMUEL, { reason: "assignment_budget_exceeded" });
  assertEquals(evaluateExhaustiveClosure(r, CAST).reason, "diagnostic_reason_refused");
});

Deno.test("O6. result-level detect_zero_faces => refuse", () => {
  assertEquals(
    evaluateExhaustiveClosure(gen33({ reason: "detect_zero_faces" }), CAST).reason,
    "technical_resolver_reason",
  );
});

Deno.test("O7. result-level detect_failed:* => refuse", () => {
  assertEquals(
    evaluateExhaustiveClosure(gen33({ reason: "detect_failed:timeout" }), CAST).reason,
    "technical_resolver_reason",
  );
});

Deno.test("O8. result-level assignment_budget_exceeded => refuse", () => {
  assertEquals(
    evaluateExhaustiveClosure(gen33({ reason: "assignment_budget_exceeded" }), CAST).reason,
    "technical_resolver_reason",
  );
});

Deno.test("O9. resolver ok=false => refuse", () => {
  assertEquals(evaluateExhaustiveClosure(gen33({ ok: false }), CAST).reason, "resolver_not_ok");
});

// ── HARDENING: bestFaceIndex ───────────────────────────────────────────────

Deno.test("O. bestFaceIndex points at a CLAIMED face, lower similarity than holder => refuse", () => {
  const r = patchDiag(gen33(), SAMUEL, { bestFaceIndex: 0, bestSimilarity: 20 });
  assertEquals(evaluateExhaustiveClosure(r, CAST).reason, "contradictory_biometric_evidence");
});

Deno.test("O2. bestFaceIndex points at a CLAIMED face with HIGHER similarity => refuse", () => {
  const r = patchDiag(gen33(), SAMUEL, { bestFaceIndex: 0, bestSimilarity: 99.9 });
  assertEquals(evaluateExhaustiveClosure(r, CAST).reason, "contradictory_biometric_evidence");
});

Deno.test("P. bestFaceIndex null => refuse best_face_unmeasured", () => {
  const r = patchDiag(gen33(), SAMUEL, { bestFaceIndex: null });
  assertEquals(evaluateExhaustiveClosure(r, CAST).reason, "best_face_unmeasured");
});

Deno.test("P1b. bestFaceIndex undefined => refuse best_face_unmeasured", () => {
  const r = patchDiag(gen33(), SAMUEL, { bestFaceIndex: undefined });
  assertEquals(evaluateExhaustiveClosure(r, CAST).reason, "best_face_unmeasured");
});

Deno.test("P2. nullish must NOT coerce into face slot 0", () => {
  // Leftover face IS slot 0 here, so `Number(null) === 0` would close wrongly.
  const base = gen33();
  const faces = [
    { slot: 0, bbox: [1, 1, 2, 2], characterId: null, similarity: null },
    { slot: 1, bbox: [1, 1, 2, 2], characterId: SARAH, similarity: 83 },
    { slot: 2, bbox: [1, 1, 2, 2], characterId: MATTHEW, similarity: 93 },
    { slot: 3, bbox: [1, 1, 2, 2], characterId: KAY, similarity: 99 },
  ] as RekognitionIdentityResult["faces"];
  const r = patchDiag({ ...base, faces }, SAMUEL, { bestFaceIndex: null });
  const d = evaluateExhaustiveClosure(r, CAST);
  assertEquals(d.applied, false);
  assertEquals(d.reason, "best_face_unmeasured");
});

Deno.test("Q. below-threshold but genuinely measured, best == leftover => closes at 0.001", () => {
  const r = patchDiag(gen33(), SAMUEL, { bestSimilarity: 0.001, reason: "below_threshold" });
  const d = evaluateExhaustiveClosure(r, CAST);
  assertEquals(d.applied, true, "V534 introduces NO similarity threshold");
  assertEquals(d.closure?.bestSimilarity, 0.001);
});

// ── LOCK KEY SPACE ─────────────────────────────────────────────────────────

Deno.test("R. occupied missing-speaker lock index => refuse", () => {
  const r = gen33({ assignmentLock: { "0": SARAH, "1": MATTHEW, "3": KAY } });
  const d = evaluateExhaustiveClosure(r, CAST);
  // MATTHEW under key "1" makes the target key occupied.
  assertEquals(d.reason, "speaker_index_occupied");
});

Deno.test("S. lock keys are speaker/cast indices, NOT face slots", () => {
  const base = gen33();
  const out = applyExhaustiveClosure(base, evaluateExhaustiveClosure(base, CAST).closure!);
  // Samuel sits on FACE slot 2 but takes SPEAKER key 1.
  assertEquals(out.faces[2].characterId, SAMUEL);
  assertEquals(out.assignmentLock["1"], SAMUEL);
  assertEquals(out.assignmentLock["2"], MATTHEW);
});

Deno.test("S2. character absent from the cast list => no derivable speaker index", () => {
  const shortCast = CAST.filter((c) => c.characterId !== SAMUEL);
  const d = evaluateExhaustiveClosure(gen33(), shortCast);
  assertEquals(d.applied, false);
  assertEquals(d.reason, "missing_character_count_not_one");
});

// ── V278 / TELEMETRY / V508 ────────────────────────────────────────────────

Deno.test("T. V278 positional labels are never consumed and never change the result", () => {
  const src = Deno.readTextFileSync(
    new URL("./v534-exhaustive-identity-closure.ts", import.meta.url),
  );
  const code = src.split("\n").filter((l) => !l.trimStart().startsWith("*") && !l.trimStart().startsWith("//")).join("\n");
  assert(!code.includes("anchor_face_layout"));
  assert(!code.includes("buildAnchorLayoutFromV274"));
  assert(!code.includes("plateFaceSlotRouter"));
  // Contradicting layout labels alongside the same resolution: identical result.
  const a = evaluateExhaustiveClosure(gen33(), CAST);
  const withLayout = {
    ...gen33(),
    // deliberately hostile, positional labels contradicting biometrics
    anchor_face_layout: {
      slots: [
        { slotIndex: 0, characterId: SARAH },
        { slotIndex: 1, characterId: SAMUEL },
        { slotIndex: 2, characterId: MATTHEW },
        { slotIndex: 3, characterId: KAY },
      ],
    },
  } as unknown as RekognitionIdentityResult;
  const b = evaluateExhaustiveClosure(withLayout, CAST);
  assertEquals(b.applied, a.applied);
  assertEquals(b.closure?.characterId, SAMUEL);
  assertEquals(b.closure?.faceIndex, 2);
});

Deno.test("U. telemetry is bounded: no URLs, base64, bytes or provider payloads", () => {
  const t = buildV534Telemetry(evaluateExhaustiveClosure(gen33(), CAST));
  const json = JSON.stringify(t);
  assert(!/https?:\/\//.test(json));
  assert(!/base64|data:image|bbox|Bytes|FaceDetails|BoundingBox/i.test(json));
  assertEquals(t.applied, true);
  assertEquals(t.lock_source, V534_CLOSURE_LOCK_SOURCE);
  assertEquals(t.biometric_resolved_count, 3);
  // Only scalars.
  for (const v of Object.values(t)) {
    assert(v === null || ["string", "number", "boolean"].includes(typeof v));
  }
});

Deno.test("V. V508: closure satisfies strict for exactly the named character only", () => {
  const dbById = new Map([SARAH, SAMUEL, MATTHEW, KAY].map((id, i) => [
    id,
    { name: `C${i}`, reference_image_url: "x", identity_lock_strength: "strict" },
  ]));
  const records = buildCanonicalCastRecords(
    [{ characterId: SARAH }, { characterId: SAMUEL }, { characterId: MATTHEW }, { characterId: KAY }],
    dbById as never,
  );
  const base = gen33();
  const closed = applyExhaustiveClosure(base, evaluateExhaustiveClosure(base, CAST).closure!);
  const withoutClosure = evaluateStrictVerification(records, closed.assignmentLock);
  const withClosure = evaluateStrictVerification(records, base.assignmentLock, null, {
    characterId: SAMUEL,
    faceIndex: 2,
  });
  // Without the explicit closure object the lock alone is enough (it now
  // contains Samuel) — so prove the closure path on the PRE-closure lock.
  assertEquals(withoutClosure.ok, true);
  assertEquals(withClosure.ok, true);
  const samuel = withClosure.evidence.find((e) => e.characterId === SAMUEL)!;
  assertEquals(samuel.evidenceClass, "deduced_closure");
  for (const e of withClosure.evidence) {
    if (e.characterId !== SAMUEL) assertEquals(e.evidenceClass, "biometric");
  }
  // A closure naming someone else does NOT rescue Samuel.
  const wrong = evaluateStrictVerification(records, base.assignmentLock, null, {
    characterId: KAY,
    faceIndex: 3,
  });
  assertEquals(wrong.ok, false);
  assertEquals(wrong.reason?.includes("strict_anchor_identity_unverified"), true);
});

Deno.test("W. V508 global semantics unchanged: deduced_closure never satisfies strict", () => {
  assertEquals([...STRICT_EVIDENCE_CLASSES], ["biometric"]);
  assertEquals(evidenceSatisfiesStrict("deduced_closure" as never), false);
  assert(
    V508SRC.includes('export const STRICT_EVIDENCE_CLASSES: readonly EvidenceClass[] = ["biometric"];'),
  );
});

// ── FREEZE ─────────────────────────────────────────────────────────────────

Deno.test("X. resolver frozen: no V534, thresholds and budget unchanged", () => {
  assert(!SRC.includes("v534") && !SRC.includes("V534"));
  assert(!SRC.includes("deduced_closure"));
  assert(/MIN_SIMILARITY\s*=\s*55/.test(SRC));
  assert(/MIN_SIMILARITY_PASS2\s*=\s*45/.test(SRC));
  assert(/ASSIGN_NODE_BUDGET\s*=\s*200_000/.test(SRC));
});

Deno.test("Y. V523–V533 and compose-dialog-segments carry no V534", () => {
  const files = [
    "./v523-identity-repair.ts",
    "./v524-plate-identity-registration.ts",
    "./v526b-common-frame-identity.ts",
    "./plateFaceSlotRouter.ts",
    "./plate-face-track.ts",
    "../compose-dialog-segments/index.ts",
  ];
  for (const f of files) {
    let src = "";
    try {
      src = Deno.readTextFileSync(new URL(f, import.meta.url));
    } catch {
      continue;
    }
    assert(!/v534/i.test(src), `${f} must not mention V534`);
    assert(!src.includes("deduced_closure"), `${f} must not mention deduced_closure`);
  }
});

Deno.test("Z. application point: after V514 convergence, before the authority read", () => {
  const recovery = CLIPS.indexOf("if (v514Acceptance.accept) {");
  const v534 = CLIPS.indexOf("const v534Decision = evaluateExhaustiveClosure(");
  const authority = CLIPS.indexOf("const idAuthoritative = v514Authority.resolution;");
  assert(recovery > 0 && v534 > recovery, "V534 must run AFTER the recovery decision");
  assert(v534 < authority, "V534 must run BEFORE the authority is read");
  // Exactly one call site.
  assertEquals(CLIPS.split("evaluateExhaustiveClosure(").length - 1, 1);
  assertEquals(CLIPS.split("applyExhaustiveClosure(").length - 1, 1);
  // The FIRST strict verification is untouched (no closure argument).
  const first = CLIPS.indexOf("verification: evaluateStrictVerification(");
  assert(first > 0 && first < v534);
  assert(!CLIPS.slice(first, first + 260).includes("characterId: v534Decision"));
});

Deno.test("Z2. manual face-map guard and V514 recovery semantics intact", () => {
  assert(CLIPS.includes("const v508StrictBlock = !v508Verify.ok;"));
  assert(CLIPS.includes('clip_status: "awaiting_manual_face_map"'));
  assert(CLIPS.includes("anchor_identity_needs_review"));
  assert(CLIPS.includes("const v534Decision = evaluateExhaustiveClosure("));
  // Recovery acceptance still compares pure biometric verdicts.
  assert(CLIPS.includes("v514Acceptance = evaluateRecoveryAcceptance("));
  assert(CLIPS.includes("resolution: reResolved"));
  // assignmentLockSource is NOT rewritten by V534.
  assert(!CLIPS.includes('assignmentLockSource = "v274_anchor_rekognition_closure"'));
  assert(CLIPS.includes("v534_closure: v534Telemetry,"));
});
