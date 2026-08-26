/**
 * V508 — strict multi-character anchor identity, contract tests.
 *
 * Fixture is the real generation-8 cast (scene 67b392b1, run e0bb3511):
 * four strict characters, Rekognition resolved only Sarah at slot 0 with
 * similarity 98.427. The character IDs are the production ones; nothing in
 * the module or the tests special-cases them.
 */

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildAnchorConditioningTelemetry,
  buildAnchorImagePlan,
  buildCanonicalCastRecords,
  buildIdentityTelemetry,
  classifySlotEvidence,
  evaluateStrictConditioning,
  evaluateStrictVerification,
  evidenceSatisfiesStrict,
  isStrictRecord,
  strictRecoveryTargets,
  type CanonicalCastRecord,
} from "./v508-strict-identity.ts";

const SARAH = "5c81f9bf-a5f1-4608-849f-e2a4adc84bcb";
const SAMUEL = "483f9cdc-eb31-4486-bf67-9c5e7d955016";
const MATTHEW = "54d90504-7253-482f-9c6f-1902e8a6749b";
const KAY = "c65de5c6-75e1-47aa-956c-cd0cc424e736";

const SHOTS = [
  { characterId: SARAH },
  { characterId: SAMUEL },
  { characterId: MATTHEW },
  { characterId: KAY },
];

type DbRow = {
  name?: unknown;
  reference_image_url?: unknown;
  portrait_url?: unknown;
  identity_lock_strength?: unknown;
};

function dbMap(over: Partial<Record<string, DbRow>> = {}): Map<string, DbRow> {
  const base: Record<string, DbRow> = {
    [SARAH]: { name: "Sarah Dusatko", reference_image_url: "https://x/sarah-face.png", portrait_url: "https://x/sarah-body.png", identity_lock_strength: "strict" },
    [SAMUEL]: { name: "Samuel Dusatko", reference_image_url: "https://x/samuel-face.png", portrait_url: "https://x/samuel-body.png", identity_lock_strength: "strict" },
    [MATTHEW]: { name: "Matthew Dusatko", reference_image_url: "https://x/matthew-face.png", portrait_url: "https://x/matthew-body.png", identity_lock_strength: "strict" },
    [KAY]: { name: "Kay Mark", reference_image_url: "https://x/kay-face.png", portrait_url: "https://x/kay-body.png", identity_lock_strength: "strict" },
  };
  return new Map(Object.entries({ ...base, ...over }) as Array<[string, DbRow]>);
}

const records = (over?: Partial<Record<string, DbRow>>, client?: Map<string, any>, wardrobe?: Array<string | null>) =>
  buildCanonicalCastRecords(SHOTS, dbMap(over), client ?? null, wardrobe ?? null);

// ── 1. Conditioning telemetry on the healthy fixture ──────────────────────

Deno.test("V508 — four strict characters with four canonical DB refs report 4/4", () => {
  const recs = records();
  assertEquals(recs.length, 4);
  assertEquals(recs.map((r) => r.characterId), [SARAH, SAMUEL, MATTHEW, KAY]);
  assertEquals(recs.every(isStrictRecord), true);
  assertEquals(recs.every((r) => r.source === "db"), true);

  const plan = buildAnchorImagePlan(recs);
  const t = buildAnchorConditioningTelemetry(recs, plan, { anchorModelRoute: "nano_banana_2" });
  assertEquals(t.character_count, 4);
  assertEquals(t.portrait_count, 4);
  assertEquals(t.identity_ref_count, 4);
  assertEquals(t.strict_count, 4);
  assertEquals(t.strict_identity_ref_count, 4);
  assertEquals(t.identity_refs_complete, true);
  assertEquals(t.identity_ref_present_by_slot, [true, true, true, true]);
  assertEquals(t.character_ids, [SARAH, SAMUEL, MATTHEW, KAY]);
  // No signed URLs in telemetry.
  assert(!JSON.stringify(t).includes("https://"), "telemetry must not carry URLs");
});

// ── 2. The DB wins over an incomplete client payload ──────────────────────

Deno.test("V508 — a client payload without referenceImageUrl still gets the DB refs", () => {
  // Reproduces the hazard: all four characters present in the client payload
  // but with no identity reference, so the old hydration path never fired.
  const client = new Map<string, any>([
    [SARAH, { name: "Sarah Dusatko" }],
    [SAMUEL, { name: "Samuel Dusatko" }],
    [MATTHEW, { name: "Matthew Dusatko" }],
    [KAY, { name: "Kay Mark" }],
  ]);
  const recs = records(undefined, client);
  assertEquals(recs.every((r) => !!r.identityReferenceUrl), true);
  assertEquals(recs.every((r) => r.source === "db"), true);
  assertEquals(buildAnchorImagePlan(recs).identityPortraitUrls.length, 4);
});

Deno.test("V508 — the client is only a fallback, never an override", () => {
  const client = new Map<string, any>([[SAMUEL, { referenceImageUrl: "https://x/client-samuel.png" }]]);
  const recs = records({ [MATTHEW]: { name: "Matthew Dusatko", identity_lock_strength: "strict", portrait_url: "https://x/matthew-body.png" } }, client);
  // DB present -> DB wins.
  assertEquals(recs[1].identityReferenceUrl, "https://x/samuel-face.png");
  assertEquals(recs[1].source, "db");
  // DB absent, client absent -> missing.
  assertEquals(recs[2].identityReferenceUrl, null);
  assertEquals(recs[2].source, "missing");
});

// ── 3. Conditioning fail-closed ───────────────────────────────────────────

Deno.test("V508 — a strict character without an identity reference is refused", () => {
  const recs = records({
    [MATTHEW]: { name: "Matthew Dusatko", portrait_url: "https://x/matthew-body.png", identity_lock_strength: "strict" },
  });
  const v = evaluateStrictConditioning(recs);
  assertEquals(v.ok, false);
  assertEquals(v.strictCount, 4);
  assertEquals(v.strictWithReference, 3);
  assertEquals(v.missing.map((m) => m.characterId), [MATTHEW]);
  assert(v.reason!.startsWith("strict_anchor_identity_reference_missing:"), v.reason!);
  assert(v.reason!.includes("Matthew Dusatko"), v.reason!);
});

Deno.test("V508 — a NON-strict character without a reference does not block", () => {
  const recs = records({
    [MATTHEW]: { name: "Matthew Dusatko", portrait_url: "https://x/matthew-body.png", identity_lock_strength: "loose" },
  });
  const v = evaluateStrictConditioning(recs);
  assertEquals(v.ok, true);
  assertEquals(v.strictCount, 3);
  assertEquals(v.reason, null);
});

// ── 4. Alignment: a gap must never shift a later identity left ────────────

Deno.test("V508 — a missing optional identity ref never becomes the next slot's face", () => {
  const recs = records({
    [SAMUEL]: { name: "Samuel Dusatko", portrait_url: "https://x/samuel-body.png", identity_lock_strength: "loose" },
  });
  const plan = buildAnchorImagePlan(recs);

  // Truthful per-slot presence, never shifted.
  assertEquals(plan.identityRefPresentBySlot, [true, false, true, true]);
  assertEquals(plan.characterNames, ["Sarah Dusatko", "Samuel Dusatko", "Matthew Dusatko", "Kay Mark"]);
  assertEquals(plan.portraitUrls.length, 4);

  // The old code produced ["sarah","matthew","kay"] here and the consumer
  // read index 1 as Samuel — handing Matthew's face to Samuel's name.
  assertEquals(plan.identityRefsComplete, false);
  assertEquals(plan.identityPortraitUrls, []);
  assert(
    !plan.identityPortraitUrls.includes("https://x/matthew-face.png"),
    "a shifted identity list must never be emitted",
  );
});

Deno.test("V508 — a complete set stays index-aligned one to one", () => {
  const plan = buildAnchorImagePlan(records());
  assertEquals(plan.identityPortraitUrls, [
    "https://x/sarah-face.png",
    "https://x/samuel-face.png",
    "https://x/matthew-face.png",
    "https://x/kay-face.png",
  ]);
  for (let i = 0; i < plan.characterNames.length; i++) {
    const first = plan.characterNames[i].split(" ")[0].toLowerCase();
    assert(plan.identityPortraitUrls[i].includes(first), `slot ${i} misaligned`);
    assert(plan.portraitUrls[i].includes(first), `slot ${i} wardrobe misaligned`);
  }
});

// ── 5. Generation-8 class: 1 of 4 resolved ────────────────────────────────

Deno.test("V508 — generation-8 fixture: 1/4 strict resolved, recovery targets named", () => {
  const recs = records();
  const lock = { "0": SARAH }; // exactly what production persisted
  const sims = new Map<string, number | null>([[SARAH, 98.427]]);
  const v = evaluateStrictVerification(recs, lock, sims);

  assertEquals(v.ok, false);
  assertEquals(v.expectedStrict, 4);
  assertEquals(v.resolvedStrict, 1);
  assertEquals(v.unresolved.map((u) => u.characterId), [SAMUEL, MATTHEW, KAY]);
  assert(v.reason!.startsWith("strict_anchor_identity_unverified:"), v.reason!);

  // Sarah is biometric with her real similarity; the others are unverified.
  const sarah = v.evidence.find((e) => e.characterId === SARAH)!;
  assertEquals(sarah.evidenceClass, "biometric");
  assertEquals(sarah.rekognitionSimilarity, 98.427);
  assertEquals(sarah.slot, 0);
  for (const id of [SAMUEL, MATTHEW, KAY]) {
    const e = v.evidence.find((x) => x.characterId === id)!;
    assertEquals(e.evidenceClass, "unverified");
    assertEquals(e.rekognitionSimilarity, null);
  }

  // These names feed the EXISTING face-lock retry.
  assertEquals(strictRecoveryTargets(v), ["Samuel Dusatko", "Matthew Dusatko", "Kay Mark"]);
});

Deno.test("V508 — recovery success: the repaired anchor resolves 4/4 and proceeds", () => {
  const recs = records();
  const repaired = { "0": SARAH, "1": SAMUEL, "2": MATTHEW, "3": KAY };
  const v = evaluateStrictVerification(recs, repaired);
  assertEquals(v.ok, true);
  assertEquals(v.resolvedStrict, 4);
  assertEquals(v.unresolved, []);
  assertEquals(v.reason, null);
  assertEquals(strictRecoveryTargets(v), []);
});

Deno.test("V508 — recovery failure: still short of 4/4 stays refused", () => {
  const recs = records();
  for (const lock of [{ "0": SARAH }, { "0": SARAH, "1": SAMUEL, "2": MATTHEW }]) {
    const v = evaluateStrictVerification(recs, lock);
    assertEquals(v.ok, false, JSON.stringify(lock));
    assert(v.reason!.includes("strict_anchor_identity_unverified"), v.reason!);
  }
});

// ── 6. Non-strict control and mixed casts ─────────────────────────────────

Deno.test("V508 — an all non-strict cast imposes no strict requirement", () => {
  const loose = Object.fromEntries(
    [SARAH, SAMUEL, MATTHEW, KAY].map((id) => [id, {
      name: "X",
      reference_image_url: "https://x/f.png",
      portrait_url: "https://x/b.png",
      identity_lock_strength: "loose",
    }]),
  );
  const recs = records(loose as never);
  const v = evaluateStrictVerification(recs, { "0": SARAH });
  assertEquals(v.expectedStrict, 0);
  assertEquals(v.resolvedStrict, 0);
  assertEquals(v.ok, true);
  assertEquals(v.reason, null);
});

Deno.test("V508 — mixed cast: only the strict slots are required", () => {
  const recs = records({
    [MATTHEW]: { name: "Matthew Dusatko", reference_image_url: "https://x/matthew-face.png", portrait_url: "https://x/matthew-body.png", identity_lock_strength: "loose" },
    [KAY]: { name: "Kay Mark", reference_image_url: "https://x/kay-face.png", portrait_url: "https://x/kay-body.png", identity_lock_strength: null },
  });
  // Sarah + Samuel strict and both locked; Matthew/Kay unresolved but loose.
  const v = evaluateStrictVerification(recs, { "0": SARAH, "1": SAMUEL });
  assertEquals(v.expectedStrict, 2);
  assertEquals(v.resolvedStrict, 2);
  assertEquals(v.ok, true);
});

// ── 7. Positional / inferred can never satisfy strict ─────────────────────

Deno.test("V508 — a 0.97 geometry score is positional, not identity", () => {
  const c = classifySlotEvidence({ positional: true });
  assertEquals(c, "positional");
  assertEquals(evidenceSatisfiesStrict(c), false);
});

Deno.test("V508 — the last-slot inference at 0.5 is inferred, not identity", () => {
  const c = classifySlotEvidence({ inferred: true, vlmScore: 0.5 });
  assertEquals(c, "inferred");
  assertEquals(evidenceSatisfiesStrict(c), false);
});

Deno.test("V508 — a high VLM score without margin is ambiguous, not proof", () => {
  assertEquals(classifySlotEvidence({ vlmScore: 0.95, vlmMargin: 0.02 }), "vlm_ambiguous");
  assertEquals(classifySlotEvidence({ vlmScore: 0.95, vlmMargin: 0.4 }), "vlm_high_margin");
  assertEquals(evidenceSatisfiesStrict("vlm_high_margin"), false);
  assertEquals(evidenceSatisfiesStrict("vlm_ambiguous"), false);
  assertEquals(evidenceSatisfiesStrict("biometric"), true);
});

Deno.test("V508 — only a biometric assignment satisfies strict", () => {
  const classes = ["biometric", "vlm_high_margin", "vlm_ambiguous", "positional", "inferred", "unverified"] as const;
  assertEquals(classes.filter(evidenceSatisfiesStrict), ["biometric"]);
});

// ── 8. Truthful telemetry ─────────────────────────────────────────────────

Deno.test("V508 — a geometry router cannot emit biometric semantics or a margin", () => {
  const t = buildIdentityTelemetry({
    identityMethod: "v278_hungarian_plate_router",
    confidenceSemantics: "geometry",
    minConfidence: 0.9095,
    minMargin: 1,          // the hardcoded lie the old code persisted
    ambiguous: false,      // likewise
  });
  assertEquals(t.confidenceSemantics, "geometry");
  assertEquals(t.identityMethod, "v278_hungarian_plate_router");
  assertEquals(t.minConfidence, 0.9095);
  // Geometry measures no margin and proves no unambiguity.
  assertEquals(t.minMargin, null);
  assertEquals(t.ambiguous, null);
  assert(t.identityMethod !== "per-char-hungarian");
});

Deno.test("V508 — a real VLM run keeps its measured margin", () => {
  const t = buildIdentityTelemetry({
    identityMethod: "per-char-hungarian",
    confidenceSemantics: "vlm",
    minConfidence: 0.91,
    minMargin: 0.32,
    ambiguous: false,
  });
  assertEquals(t.minMargin, 0.32);
  assertEquals(t.ambiguous, false);
  assertEquals(t.confidenceSemantics, "vlm");
});

// ── 9. Degenerate input never throws ──────────────────────────────────────

Deno.test("V508 — degenerate inputs are safe", () => {
  assertEquals(buildCanonicalCastRecords([], new Map()).length, 0);
  assertEquals(buildCanonicalCastRecords(null as never, new Map()).length, 0);
  assertEquals(buildCanonicalCastRecords([null, undefined, { characterId: "" }] as never, new Map()).length, 0);

  const empty: CanonicalCastRecord[] = [];
  assertEquals(evaluateStrictConditioning(empty).ok, true);
  assertEquals(evaluateStrictVerification(empty, null).ok, true);
  assertEquals(evaluateStrictVerification(empty, {} as never).expectedStrict, 0);

  const plan = buildAnchorImagePlan(empty);
  assertEquals(plan.portraitUrls, []);
  assertEquals(plan.identityRefsComplete, false);

  // A cast larger than the anchor cap is truncated, never reordered.
  const many = buildCanonicalCastRecords(
    [...SHOTS, { characterId: "extra-1" }],
    dbMap({ "extra-1": { name: "Extra", reference_image_url: "https://x/e.png", portrait_url: "https://x/eb.png" } } as never),
  );
  assertEquals(buildAnchorImagePlan(many, 4).characterNames.length, 4);
  assertEquals(buildAnchorImagePlan(many, 4).slots, [0, 1, 2, 3]);
});

// ── 10. Source contract — the wiring, and the cost guarantee ──────────────

const CVC = Deno.readTextFileSync(new URL("../compose-video-clips/index.ts", import.meta.url));

Deno.test("V508 wiring — the canonical record list replaced the three filter chains", () => {
  assert(CVC.includes("buildCanonicalCastRecords("), "records must be built");
  assert(CVC.includes("const portraitUrls = v508Plan.portraitUrls"), "portraits from the plan");
  assert(CVC.includes("const identityPortraitUrls = v508Plan.identityPortraitUrls"), "identity refs from the plan");
  assert(CVC.includes("const characterNames = v508Plan.characterNames"), "names from the plan");
  // The independent .filter() chain that could shift identities is gone.
  assert(
    !/identityPortraitUrls = effectiveShots[\s\S]{0,200}\.filter\(/.test(CVC),
    "the independent identity .filter() chain must not return",
  );
});

Deno.test("V508 wiring — the DB is the identity authority, not the client payload", () => {
  assert(CVC.includes('.from("brand_characters")'), "brand_characters must be queried");
  assert(
    CVC.includes('"id, name, reference_image_url, portrait_url, identity_lock_strength"'),
    "the canonical select must carry the lock strength",
  );
});

Deno.test("V508 wiring — conditioning refuses BEFORE the anchor provider call", () => {
  const gate = CVC.indexOf("if (!v508Conditioning.ok)");
  const firstAnchor = CVC.indexOf('composeAnchor("attempt-1")');
  assert(gate > 0 && firstAnchor > 0, "both sites must exist");
  assert(gate < firstAnchor, "the conditioning gate must precede the first provider call");
});

Deno.test("V508 wiring — exactly one targeted recovery attempt, reusing face-lock", () => {
  const calls = CVC.match(/composeAnchor\("v508-strict-recovery"[^)]*\)/g) ?? [];
  assertEquals(calls.length, 1);
  // strict + swap + targets + faceLock, i.e. the EXISTING retry machinery.
  assert(calls[0].includes("true, true, targets, true"), calls[0]);
  assert(CVC.includes("strictRecoveryTargets(v508Verify)"), "targets come from the verdict");
});

Deno.test("V508 wiring — the strict block is additive and never flips the V276 default", () => {
  assert(
    CVC.includes("const needsManualReview = v508StrictBlock || (softGateEnabled"),
    "strict must be OR-ed onto the legacy decision, not replace it",
  );
  assert(
    CVC.includes('(Deno.env.get("V276_SOFT_GATE") ?? "true")'),
    "the V276 env default must stay 'true'",
  );
});

Deno.test("V508 wiring — thresholds and neighbouring contracts are untouched", () => {
  const RESOLVER = Deno.readTextFileSync(new URL("./resolveIdentityViaRekognition.ts", import.meta.url));
  assert(RESOLVER.includes("const MIN_SIMILARITY = 55"), "55 unchanged");
  assert(RESOLVER.includes("const MIN_SIMILARITY_PASS2 = 45"), "45 unchanged");
  // V508 owns no threshold of its own. Comments may DISCUSS 55/45; the
  // executable code must not contain them.
  const V508 = Deno.readTextFileSync(new URL("./v508-strict-identity.ts", import.meta.url));
  // Comments may DISCUSS 55/45; executable code must not contain them.
  // Comment lines are dropped without a regex so this test file itself
  // stays free of escaping hazards.
  const code = V508.split(/\r?\n/)
    .filter((l) => {
      const t = l.trim();
      return !(t.startsWith("*") || t.startsWith("/*") || t.startsWith("//"));
    })
    .join("\n");
  assert(!code.includes("MIN_SIMILARITY"), "V508 code must not restate a similarity threshold");
  assert(!code.includes(" 55") && !code.includes(" 45"), "V508 code must not carry 55/45");
});

Deno.test("V508 wiring — a strict refusal spends nothing downstream", () => {
  // The conditioning refusal exits the scene before any provider work.
  const gate = CVC.indexOf("if (!v508Conditioning.ok)");
  const block = CVC.slice(gate, gate + 2400);
  assert(block.includes("continue;"), "must leave the scene loop");
  assert(!/invokeModelark|generate-kling-video|sync\.so|renderPassFacePreclip/i.test(block));
});

// ── 11. Sparse slot-bound references ──────────────────────────────────────
//
// All-or-nothing suppression prevented misalignment but was too destructive:
// one missing OPTIONAL reference removed the valid STRICT references of every
// other slot, turning correctly-conditioned characters into avoidable strict
// verification failures. References are slot-bound now, so a gap costs only
// its own slot.

Deno.test("V508 sparse — a mixed cast keeps every reference it actually has", () => {
  // slot0 strict+ref, slot1 loose NO ref, slot2 strict+ref, slot3 loose+ref
  const recs = records({
    [SAMUEL]: { name: "Samuel Dusatko", portrait_url: "https://x/samuel-body.png", identity_lock_strength: "loose" },
    [KAY]: { name: "Kay Mark", reference_image_url: "https://x/kay-face.png", portrait_url: "https://x/kay-body.png", identity_lock_strength: "loose" },
  });

  // Strict conditioning passes — the gap is on a non-strict slot.
  const cond = evaluateStrictConditioning(recs);
  assertEquals(cond.ok, true);
  assertEquals(cond.strictCount, 2);
  assertEquals(cond.strictWithReference, 2);

  const plan = buildAnchorImagePlan(recs);
  assertEquals(plan.portraitUrls.length, 4);
  assertEquals(plan.identityRefPresentBySlot, [true, false, true, true]);

  // Slots 0, 2 and 3 are conditioned; slot 1 simply has none.
  assertEquals(plan.identityReferences.map((r) => r.slot), [0, 2, 3]);
  assertEquals(plan.identityReferences.map((r) => r.characterId), [SARAH, MATTHEW, KAY]);

  // Slot 2 stays Matthew at slot 2 — no shift, no global suppression.
  const matthew = plan.identityReferences.find((r) => r.characterId === MATTHEW)!;
  assertEquals(matthew.slot, 2);
  assertEquals(matthew.castSlot, 2);
  assertEquals(matthew.characterName, "Matthew Dusatko");
  assert(matthew.url.includes("matthew"), matthew.url);

  // Every reference points at its OWN character's portrait.
  for (const r of plan.identityReferences) {
    const first = r.characterName.split(" ")[0].toLowerCase();
    assert(r.url.includes(first), `${r.characterName} got ${r.url}`);
    assert(plan.portraitUrls[r.slot].includes(first), `slot ${r.slot} portrait mismatch`);
  }

  // The legacy positional list stays empty — it cannot express a gap.
  assertEquals(plan.identityPortraitUrls, []);
  assertEquals(plan.identityRefsComplete, false);
});

Deno.test("V508 sparse — a gap at slot 0 does not renumber the survivors", () => {
  const recs = records({
    [SARAH]: { name: "Sarah Dusatko", portrait_url: "https://x/sarah-body.png", identity_lock_strength: "loose" },
  });
  const plan = buildAnchorImagePlan(recs);
  assertEquals(plan.identityReferences.map((r) => r.slot), [1, 2, 3]);
  assertEquals(plan.identityReferences[0].characterId, SAMUEL);
  assertEquals(plan.identityReferences[0].slot, 1, "Samuel must stay at slot 1, not slide to 0");
  assertEquals(evaluateStrictConditioning(recs).ok, true);
});

Deno.test("V508 sparse — a missing STRICT reference still refuses before the provider", () => {
  const recs = records({
    [SAMUEL]: { name: "Samuel Dusatko", portrait_url: "https://x/samuel-body.png", identity_lock_strength: "strict" },
  });
  const cond = evaluateStrictConditioning(recs);
  assertEquals(cond.ok, false);
  assert(cond.reason!.startsWith("strict_anchor_identity_reference_missing:"), cond.reason!);
  assert(cond.reason!.includes("Samuel Dusatko"), cond.reason!);
});

Deno.test("V508 sparse — the complete cast is semantically identical to before", () => {
  const plan = buildAnchorImagePlan(records());
  assertEquals(plan.portraitUrls.length, 4);
  assertEquals(plan.identityReferences.map((r) => r.slot), [0, 1, 2, 3]);
  assertEquals(plan.identityReferences.map((r) => r.characterId), [SARAH, SAMUEL, MATTHEW, KAY]);
  // Legacy positional form still emitted for callers that need it.
  assertEquals(plan.identityPortraitUrls.length, 4);
  assertEquals(plan.identityRefsComplete, true);

  const t = buildAnchorConditioningTelemetry(records(), plan);
  assertEquals(t.identity_ref_count, 4);
  assertEquals(t.strict_identity_ref_count, 4);
  assertEquals(t.identity_refs_sent, true);
});

Deno.test("V508 sparse — telemetry separates 'incomplete' from 'none sent'", () => {
  const partial = records({
    [SAMUEL]: { name: "Samuel Dusatko", portrait_url: "https://x/samuel-body.png", identity_lock_strength: "loose" },
  });
  const tPartial = buildAnchorConditioningTelemetry(partial, buildAnchorImagePlan(partial));
  assertEquals(tPartial.identity_ref_count, 3);
  assertEquals(tPartial.identity_refs_sent, true);
  assertEquals(tPartial.identity_refs_complete, false);
  assertEquals(tPartial.legacy_identity_ref_count, 0);
  assertEquals(tPartial.identity_ref_slots, [
    { slot: 0, present: true },
    { slot: 1, present: false },
    { slot: 2, present: true },
    { slot: 3, present: true },
  ]);

  const none = records(Object.fromEntries(
    [SARAH, SAMUEL, MATTHEW, KAY].map((id) => [id, { name: "X", portrait_url: "https://x/b.png", identity_lock_strength: "loose" }]),
  ) as never);
  const tNone = buildAnchorConditioningTelemetry(none, buildAnchorImagePlan(none));
  assertEquals(tNone.identity_ref_count, 0);
  assertEquals(tNone.identity_refs_sent, false);
  assertEquals(tNone.identity_refs_complete, false);

  // Still no URLs anywhere.
  for (const t of [tPartial, tNone]) {
    assert(!JSON.stringify(t).includes("https://"), "telemetry must not carry URLs");
  }
});

// ── 12. Source contract — the anchor binds by slot, never by position ─────

const ANCHOR_SRC = Deno.readTextFileSync(new URL("../compose-scene-anchor/index.ts", import.meta.url));

Deno.test("V508 sparse — compose-scene-anchor accepts the structured form", () => {
  assert(ANCHOR_SRC.includes("identityReferences?:"), "the structured field must exist");
  assert(ANCHOR_SRC.includes("const useStructuredIdentity = v508Refs.length > 0"), "structured wins when supplied");
  // Legacy path preserved for callers that do not send it.
  assert(ANCHOR_SRC.includes("body.identityPortraitUrls ?? []"), "legacy path must remain");
});

Deno.test("V508 sparse — the identity clause points at the reference's OWN slot", () => {
  assert(
    ANCHOR_SRC.includes("const primarySlot = ref ? ref.slot : i;"),
    "the primary-image pointer must come from the reference's slot",
  );
  assert(
    ANCHOR_SRC.includes("Use the body/wardrobe from Image #${primarySlot + 1}"),
    "the clause must use the slot, not the compressed index",
  );
  // The old index-only association must not return.
  assert(
    !ANCHOR_SRC.includes("Use the body/wardrobe from Image #${i + 1}"),
    "index-only association must not return",
  );
});

Deno.test("V508 sparse — compose-video-clips sends the structured references", () => {
  const CVC2 = Deno.readTextFileSync(new URL("../compose-video-clips/index.ts", import.meta.url));
  assert(CVC2.includes("identityReferences: v508Plan.identityReferences"), "must send the structured list");
});
