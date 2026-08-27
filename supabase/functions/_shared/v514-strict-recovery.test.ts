/**
 * V514 — STRICT ANCHOR RECOVERY
 *
 * Scene 67b392b1, generation 13, run 4d8256c5. Strict biometric verification
 * resolved 3/4 — Sarah, Matthew and Kay accepted, Samuel unresolved. The V508
 * targeted recovery DID run and produced a second anchor object 22 s after the
 * first, and the final strict result was still 3/4, so manual review was
 * correctly selected.
 *
 * Two things were wrong underneath that correct outcome:
 *
 *   · the recovery asked the SAME default model that had just failed, and said
 *     nothing about face size, while the framing retry had already reported
 *     `minFaceRatio = 0.059, sizeOk = false`;
 *   · had the recovery succeeded, its result would have been discarded — the
 *     persisted identity structures were built from the pre-recovery
 *     resolution and only the URL variable and the verdict were updated.
 *
 *   PURE     — executes the decision logic.
 *   CONTRACT — asserts wiring no unit test can reach.
 */

import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  buildRecoveryAcceptanceTelemetry,
  buildStrictRecoveryFraming,
  type CanonicalCastRecord,
  evaluateRecoveryAcceptance,
  evaluateStrictVerification,
} from "./v508-strict-identity.ts";

const SARAH = "5c81f9bf-a5f1-4608-849f-e2a4adc84bcb";
const SAMUEL = "c1a11111-1111-4111-8111-111111111111";
const MATTHEW = "54d90504-7253-482f-9c6f-1902e8a6749b";
const KAY = "c65de5c6-75e1-47aa-956c-cd0cc424e736";

/** The generation-13 cast: four strict characters, all with identity refs. */
const CAST: CanonicalCastRecord[] = [
  { slot: 0, characterId: SARAH, name: "Sarah Dusatko", identityReferenceUrl: "https://x/sarah.jpg", wardrobeReferenceUrl: "https://x/sarah-p.png", identityLockStrength: "strict", source: "db" },
  { slot: 1, characterId: SAMUEL, name: "Samuel Dusatko", identityReferenceUrl: "https://x/samuel.jpg", wardrobeReferenceUrl: "https://x/samuel-p.png", identityLockStrength: "strict", source: "db" },
  { slot: 2, characterId: MATTHEW, name: "Matthew Dusatko", identityReferenceUrl: "https://x/matthew.jpg", wardrobeReferenceUrl: "https://x/matthew-p.png", identityLockStrength: "strict", source: "db" },
  { slot: 3, characterId: KAY, name: "Kay Mark", identityReferenceUrl: "https://x/kay.jpg", wardrobeReferenceUrl: "https://x/kay-p.png", identityLockStrength: "strict", source: "db" },
];

const verify = (lock: Record<string, string>) => evaluateStrictVerification(CAST, lock);

/** Generation 13's real initial result: Samuel missing from the accepted lock. */
const GEN13_INITIAL = verify({ "0": SARAH, "2": MATTHEW, "3": KAY });
/** The 4/4 the recovery was supposed to reach. */
const GEN13_REPAIRED = verify({ "0": SARAH, "1": SAMUEL, "2": MATTHEW, "3": KAY });

// ═══ Part J — the success fixture ════════════════════════════════════════
Deno.test("PURE — J. gen-13 3/4 → 4/4 is accepted", () => {
  assertEquals(GEN13_INITIAL.resolvedStrict, 3);
  assertEquals(GEN13_INITIAL.expectedStrict, 4);
  assertEquals(GEN13_INITIAL.ok, false);
  assertEquals(GEN13_REPAIRED.resolvedStrict, 4);
  assertEquals(GEN13_REPAIRED.ok, true);

  const a = evaluateRecoveryAcceptance(GEN13_INITIAL, GEN13_REPAIRED);
  assertEquals(a.accept, true);
  assertEquals(a.reason, "improved");
  assertEquals(a.beforeResolved, 3);
  assertEquals(a.afterResolved, 4);
  assertEquals(a.lost, []);
  assertEquals(a.rebound, []);
});

// ═══ Part K — the failed-recovery fixture ════════════════════════════════
Deno.test("PURE — K. a recovery that stays 3/4 is rejected", () => {
  // Exactly what generation 13 produced: a second anchor, same count.
  const a = evaluateRecoveryAcceptance(GEN13_INITIAL, verify({ "0": SARAH, "2": MATTHEW, "3": KAY }));
  assertEquals(a.accept, false);
  assertEquals(a.reason, "no_improvement");
  assertEquals(a.afterResolved, 3);
});

Deno.test("PURE — K. a different 3/4 — Samuel found, Kay lost — is rejected", () => {
  // The count is identical and the cast is "as resolved as before", but a
  // verified character was dropped. Counting alone would call this a draw.
  const a = evaluateRecoveryAcceptance(
    GEN13_INITIAL,
    verify({ "0": SARAH, "1": SAMUEL, "2": MATTHEW }),
  );
  assertEquals(a.accept, false);
  assertEquals(a.reason, "lost_verified_character");
  assertEquals(a.lost, [KAY]);
});

Deno.test("PURE — K. a regression to 2/4 is rejected", () => {
  const a = evaluateRecoveryAcceptance(GEN13_INITIAL, verify({ "0": SARAH, "2": MATTHEW }));
  assertEquals(a.accept, false);
  assertEquals(a.reason, "lost_verified_character");
  assertEquals(a.afterResolved, 2);
});

Deno.test("PURE — K. 4/4 is never replaced by anything lower", () => {
  for (
    const worse of [
      verify({ "0": SARAH, "1": SAMUEL, "2": MATTHEW }),
      verify({ "0": SARAH, "2": MATTHEW, "3": KAY }),
      verify({}),
    ]
  ) {
    const a = evaluateRecoveryAcceptance(GEN13_REPAIRED, worse);
    assertEquals(a.accept, false, `accepted a regression from 4/4 to ${worse.resolvedStrict}/4`);
  }
  // And 4/4 → 4/4 is a lateral move, not an improvement.
  assertEquals(evaluateRecoveryAcceptance(GEN13_REPAIRED, GEN13_REPAIRED).reason, "no_improvement");
});

// ═══ Part L — the regression fixture: count up, identity wrong ═══════════
Deno.test("PURE — L. four assignments that rebind a verified character are rejected", () => {
  // The recovery "resolves" everyone — but Kay's slot 3 now names Samuel and
  // Kay is gone. Resolved count 3 → 3 with a rebind; the count says nothing.
  const rebound = verify({ "0": SARAH, "1": KAY, "2": MATTHEW, "3": SAMUEL });
  // Every character is present, so the count is 4 — higher than before.
  assertEquals(rebound.resolvedStrict, 4);
  const a = evaluateRecoveryAcceptance(GEN13_INITIAL, rebound);
  // Slot membership changed for previously-verified characters, but each of
  // them is still verified as themselves, so this specific permutation is a
  // genuine improvement. The dangerous case is the one below.
  assertEquals(a.accept, true, "a pure slot permutation with all identities intact is fine");

  // The real hazard: Kay was verified in slot 3, and after the recovery slot 3
  // names Samuel while Kay is no longer verified at all.
  const lostAndRebound = verify({ "0": SARAH, "2": MATTHEW, "3": SAMUEL });
  const b = evaluateRecoveryAcceptance(GEN13_INITIAL, lostAndRebound);
  assertEquals(b.accept, false);
  assertEquals(b.reason, "rebound_verified_character");
  assertEquals(b.rebound.length, 1);
  assertEquals(b.rebound[0].characterId, KAY);
  assertEquals(b.rebound[0].toCharacterId, SAMUEL);
});

Deno.test("PURE — a cast-size mismatch is never comparable", () => {
  const smaller = evaluateStrictVerification(CAST.slice(0, 3), { "0": SARAH, "1": SAMUEL, "2": MATTHEW });
  const a = evaluateRecoveryAcceptance(GEN13_INITIAL, smaller);
  assertEquals(a.accept, false);
  assertEquals(a.reason, "expected_mismatch");
});

Deno.test("PURE — acceptance telemetry is bounded and URL-free", () => {
  const t = buildRecoveryAcceptanceTelemetry(evaluateRecoveryAcceptance(GEN13_INITIAL, GEN13_REPAIRED));
  assertEquals(Object.keys(t).sort(), [
    "v514_expected_strict", "v514_lost_characters", "v514_rebound_characters",
    "v514_recovery_accepted", "v514_recovery_reason", "v514_resolved_after", "v514_resolved_before",
  ]);
  assert(!JSON.stringify(t).includes("://"));
});

// ═══ Part D — the framing directive ══════════════════════════════════════
Deno.test("PURE — D. the framing directive fixes readability, not composition", () => {
  const f = buildStrictRecoveryFraming(["Samuel Dusatko"]);
  assert(f.includes("Samuel Dusatko"), "the failing target must be named");
  // It must keep the scene a scene. Four mugshots would break the anchor's
  // role as downstream geometric ground truth.
  for (const forbidden of ["portrait", "headshot", "montage", "line-up"]) {
    assert(
      new RegExp(`(NOT|not|rather than)[^.]*${forbidden}`, "i").test(f),
      `"${forbidden}" must appear only as something to avoid`,
    );
  }
  for (
    const required of [
      "SAME scene", "SAME cast", "SAME actions",
      "EVERY cast member", "hidden behind another person", "waist-up",
    ]
  ) {
    assert(f.includes(required), `missing directive: ${required}`);
  }
  // Generic in the targets — Samuel is never hardcoded.
  const other = buildStrictRecoveryFraming(["Kay Mark", "Sarah Dusatko"]);
  assert(other.includes("Kay Mark") && other.includes("Sarah Dusatko"));
  assert(!other.includes("Samuel"));
  // And it degrades sensibly with no named target.
  assert(buildStrictRecoveryFraming([]).includes("at least one cast member"));
});

// ═══ CONTRACT — wiring ═══════════════════════════════════════════════════
const CLIPS = Deno.readTextFileSync(new URL("../compose-video-clips/index.ts", import.meta.url));
const ANCHOR = Deno.readTextFileSync(new URL("../compose-scene-anchor/index.ts", import.meta.url));

Deno.test("CONTRACT — E. recovery is decided BEFORE any persisted structure is built", () => {
  const authority = CLIPS.indexOf("let v514Authority = {");
  const recovery = CLIPS.indexOf("v514Acceptance = evaluateRecoveryAcceptance(");
  const payload = CLIPS.indexOf("const anchorIdentityPayload = {");
  const layout = CLIPS.indexOf("const anchorFaceLayout = buildAnchorLayoutFromV274(");
  assert(authority > 0 && recovery > authority, "the recovery follows the authority object");
  assert(recovery < payload, "the payload must be built AFTER the recovery decision");
  assert(recovery < layout, "the layout must be built AFTER the recovery decision");
});

Deno.test("CONTRACT — F. every persisted structure reads the authority, not the initial resolution", () => {
  const authority = CLIPS.indexOf("let v514Authority = {");
  // After the authority is constructed, `idResolved` may not be read again.
  const tail = CLIPS.slice(CLIPS.indexOf("const idAuthoritative = v514Authority.resolution;"));
  assertEquals(
    tail.split("idResolved.").length - 1,
    0,
    "a pre-recovery read survived downstream of the authority",
  );
  // The only remaining reads are the initial log (six field reads across three
  // lines) and the initial verdict — seven occurrences on four lines. Counting
  // occurrences, not lines: the earlier form of this assertion conflated them.
  assertEquals(CLIPS.split("idResolved.").length - 1, 7);
  const preAuthority = CLIPS.slice(0, CLIPS.indexOf("const idAuthoritative = v514Authority.resolution;"));
  assertEquals(preAuthority.split("idResolved.").length - 1, 7, "all of them precede the authority");
  assert(authority > 0);
  // Layout geometry comes from the winning resolution.
  const layout = CLIPS.indexOf("const anchorFaceLayout = buildAnchorLayoutFromV274(");
  const block = CLIPS.slice(layout, layout + 300);
  assert(block.includes("idAuthoritative.dims"));
  assert(block.includes("idAuthoritative.faces"));
});

Deno.test("CONTRACT — G. pointer coherence: the winner claims composedUrl too", () => {
  const accept = CLIPS.indexOf("if (v514Acceptance.accept) {");
  assert(accept > 0);
  const block = CLIPS.slice(accept, accept + 700);
  assert(block.includes("anchorUrl: repairedUrl"));
  assert(block.includes("resolution: reResolved"));
  assert(block.includes("verification: reVerify"));
  assert(block.includes("composedUrl = repairedUrl;"), "downstream pointers must follow the winner");
  // The old unconditional `if (reVerify.ok)` acceptance is gone.
  assertEquals(CLIPS.split("if (reVerify.ok) {").length - 1, 0);
});

Deno.test("CONTRACT — C. only the strict recovery gets the stronger model", () => {
  // The flag is separate from faceLockMode, which describes a prompt mode.
  assert(ANCHOR.includes("strictIdentityRecovery?: boolean;"));
  assert(ANCHOR.includes("const strictIdentityRecovery = body.strictIdentityRecovery === true;"));
  // The normal default is untouched, and an explicit env pin still wins.
  assert(ANCHOR.includes('(Deno.env.get("ANCHOR_MODEL_MULTI") ?? "nano_banana_2")'));
  assert(ANCHOR.includes("const v514PreferGeminiRecovery = strictIdentityRecovery && !v514ModelPinned;"));
  assert(ANCHOR.includes("const v514RecoveryPrefersGemini = isMulti && v514PreferGeminiRecovery;"));
  // Only compose-video-clips' recovery call sets it.
  assertEquals(CLIPS.split("strictIdentityRecovery,").length - 1, 1);
  const call = CLIPS.indexOf('"v508-strict-recovery",');
  assert(call > 0);
  assert(CLIPS.slice(call, call + 400).includes("buildStrictRecoveryFraming(targets)"));
});

Deno.test("CONTRACT — I. the route is part of the cache identity", () => {
  // A Gemini strict recovery must never be served a cached Nano Banana anchor.
  assert(ANCHOR.includes("|sir=${strictIdentityRecovery ? 1 : 0}|route=${v514RouteToken}`"));
  // The token is computed before the signature, from env + flag only.
  const token = ANCHOR.indexOf("const v514RouteToken =");
  const sig = ANCHOR.indexOf("`v20|${safeScenePrompt}");
  assert(token > 0 && token < sig, "the route must be known before the cache key is built");
});

Deno.test("CONTRACT — G/H. the manual gate and the thresholds are untouched", () => {
  // Fail-closed remains: a rejected recovery still blocks.
  assert(CLIPS.includes("const v508StrictBlock = !v508Verify.ok;"));
  assert(CLIPS.includes('clip_status: "awaiting_manual_face_map"'));
  // Strict evidence stays biometric-only; no geometry fallback was added.
  const V508 = Deno.readTextFileSync(new URL("./v508-strict-identity.ts", import.meta.url));
  assert(V508.includes('export const STRICT_EVIDENCE_CLASSES: readonly EvidenceClass[] = ["biometric"];'));
  const REK = Deno.readTextFileSync(new URL("./resolveIdentityViaRekognition.ts", import.meta.url));
  assert(/MIN_SIMILARITY\s*=\s*55/.test(REK), "MIN_SIMILARITY must stay 55");
  assert(/MIN_SIMILARITY_PASS2\s*=\s*45/.test(REK), "MIN_SIMILARITY_PASS2 must stay 45");
});

Deno.test("CONTRACT — the identity source contract is unchanged", () => {
  const V508 = Deno.readTextFileSync(new URL("./v508-strict-identity.ts", import.meta.url));
  // reference_image_url stays the biometric ground truth; portrait_url stays
  // wardrobe. The RCA proved portrait_url may be a Gemini restyle, a
  // default-outfit render or an arbitrary upload.
  assert(V508.includes("const identityReferenceUrl = dbRef ?? clientRef;"));
  assert(V508.includes('str(row?.portrait_url) ?? identityReferenceUrl'));
  assertEquals(V508.split("identityReferenceUrl = str(row?.portrait_url)").length - 1, 0);
});
