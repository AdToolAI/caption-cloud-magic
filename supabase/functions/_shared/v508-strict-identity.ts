/**
 * V508 — STRICT MULTI-CHARACTER ANCHOR IDENTITY (PURE)
 * ---------------------------------------------------------------------------
 * Production incident, scene 67b392b1, generation 8, run e0bb3511:
 *
 *   expectedCount 4, resolvedCount 1, matched ["0"], minSimilarity 98.427
 *   Sarah biometrically locked. Samuel / Matthew / Kay: no assignment.
 *
 * A 1-of-4 biometric result became the identity authority for the whole
 * video pipeline; the other three identities were labelled by POSITION. The
 * run then spent base-video generation, Remotion pre-clips, six Sync.so
 * passes and a mux on a cast the user did not recognise.
 *
 * THREE CONCERNS, PERMANENTLY SEPARATED
 *
 *   CONDITIONING  which character-specific references did the generator
 *                 actually receive?
 *   VERIFICATION  does generated face X match character X?
 *   ROUTING       where is that VERIFIED identity located?
 *
 * Routing may place a verified identity. It must never MANUFACTURE one.
 *
 * This module is PURE: no I/O, no provider calls, no thresholds of its own.
 * `MIN_SIMILARITY` 55 / 45 stay where they are, in
 * `resolveIdentityViaRekognition`; V508 consumes that resolver's ACCEPTED
 * assignment and never reinterprets its numbers.
 */

export const V508_VERSION = "v508";

/** The one lock value that carries the strict contract. */
export const STRICT_LOCK = "strict";

/**
 * ONE indexed record per cast slot.
 *
 * The previous code derived `portraitUrls`, `identityPortraitUrls` and
 * `characterNames` as three independent `.map(…).filter(…)` chains over the
 * same source. Any missing lookup shrank one array but not the others, and
 * the consumer aligned them BY INDEX — so a gap at slot 1 silently handed
 * slot 2's face to slot 1 as "GROUND TRUTH". Everything here is derived from
 * this single aligned list instead.
 */
export interface CanonicalCastRecord {
  slot: number;
  characterId: string;
  name: string;
  /** Face-only headshot — the identity ground truth. `null` when absent. */
  identityReferenceUrl: string | null;
  /** Outfit cover or portrait — body/wardrobe. May drift in identity. */
  wardrobeReferenceUrl: string | null;
  identityLockStrength: string | null;
  /** Where the identity reference came from. */
  source: "db" | "client" | "missing";
}

const str = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length > 0 ? s : null;
};

/** PURE — does this record carry the strict contract? */
export function isStrictRecord(r: Pick<CanonicalCastRecord, "identityLockStrength">): boolean {
  return String(r?.identityLockStrength ?? "").trim().toLowerCase() === STRICT_LOCK;
}

/**
 * PURE — build one aligned record list.
 *
 * The DB row is authority for identity reference, name and strict status.
 * The client payload may still own wardrobe/outfit state, which is why it is
 * passed separately rather than merged upstream.
 */
export function buildCanonicalCastRecords(
  shots: Array<{ characterId?: unknown } | null | undefined>,
  dbById: Map<string, { name?: unknown; reference_image_url?: unknown; portrait_url?: unknown; identity_lock_strength?: unknown }>,
  clientById?: Map<string, { name?: unknown; referenceImageUrl?: unknown }> | null,
  wardrobeBySlot?: Array<string | null | undefined> | null,
): CanonicalCastRecord[] {
  const out: CanonicalCastRecord[] = [];
  const list = Array.isArray(shots) ? shots : [];
  for (let slot = 0; slot < list.length; slot++) {
    const cid = str(list[slot]?.characterId);
    if (!cid) continue;
    const row = dbById.get(cid);
    const client = clientById?.get(cid);

    // DB first — the client payload is presentation state and has been seen
    // to omit `referenceImageUrl` entirely while the DB row was populated.
    const dbRef = str(row?.reference_image_url);
    const clientRef = str(client?.referenceImageUrl);
    const identityReferenceUrl = dbRef ?? clientRef;
    const source: CanonicalCastRecord["source"] = dbRef ? "db" : clientRef ? "client" : "missing";

    const wardrobe = str(wardrobeBySlot?.[slot]) ??
      str(row?.portrait_url) ?? identityReferenceUrl;

    out.push({
      slot,
      characterId: cid,
      name: str(row?.name) ?? str(client?.name) ?? `Character #${slot + 1}`,
      identityReferenceUrl,
      wardrobeReferenceUrl: wardrobe,
      identityLockStrength: str(row?.identity_lock_strength),
      source,
    });
  }
  return out;
}

// ── CONDITIONING ───────────────────────────────────────────────────────────

export interface StrictConditioningVerdict {
  ok: boolean;
  strictCount: number;
  strictWithReference: number;
  missing: Array<{ characterId: string; name: string; slot: number }>;
  reason: string | null;
}

/**
 * PURE — may this cast be sent to the anchor generator?
 *
 * A strict character without its own identity reference cannot be
 * conditioned at all: the generator would receive only a name in prose. That
 * is refused BEFORE the provider call, so a strict cast is never rendered on
 * hope. Non-strict characters are untouched.
 */
export function evaluateStrictConditioning(
  records: CanonicalCastRecord[],
): StrictConditioningVerdict {
  const strict = (records ?? []).filter(isStrictRecord);
  const missing = strict
    .filter((r) => !r.identityReferenceUrl)
    .map((r) => ({ characterId: r.characterId, name: r.name, slot: r.slot }));
  const ok = missing.length === 0;
  return {
    ok,
    strictCount: strict.length,
    strictWithReference: strict.length - missing.length,
    missing,
    reason: ok
      ? null
      : `strict_anchor_identity_reference_missing:${missing.map((m) => m.name || m.characterId).join(",")}`,
  };
}

// ── IMAGE PLAN ─────────────────────────────────────────────────────────────

/**
 * A face reference that carries its own binding.
 *
 * The whole point: nothing downstream may infer
 * `identityPortraitUrls[i] belongs to characterNames[i]`. A sparse list
 * read positionally is exactly how slot 2's face becomes slot 1's
 * "GROUND TRUTH". The slot and the name travel WITH the url.
 */
export interface AnchorIdentityReference {
  /**
   * 0-based position of this character's PRIMARY (wardrobe) image in
   * `portraitUrls`, i.e. Image #(slot + 1) in the generated prompt. This is
   * what the identity clause must point back to — never the compressed
   * index of the identity list itself.
   */
  slot: number;
  /** Original cast slot from `CanonicalCastRecord.slot`. Telemetry only. */
  castSlot: number;
  characterId: string;
  characterName: string;
  url: string;
}

export interface AnchorImagePlan {
  /** Wardrobe/portrait images, index-aligned with `characterNames`. */
  portraitUrls: string[];
  /**
   * SPARSE, slot-bound identity references — the authoritative form.
   * A character without a reference is simply absent; the others keep
   * their own slot, so a missing OPTIONAL reference never shifts a
   * neighbour and never removes a valid strict one.
   */
  identityReferences: AnchorIdentityReference[];
  /**
   * LEGACY positional form, for callers that cannot take the structured
   * list. Emitted ONLY when every slot has a reference, because a partial
   * positional list is unreadable without its slots.
   */
  identityPortraitUrls: string[];
  characterNames: string[];
  /** Truthful per-slot presence, for telemetry. Never shifted. */
  identityRefPresentBySlot: boolean[];
  identityRefSourceBySlot: Array<CanonicalCastRecord["source"]>;
  /** False when identity refs were suppressed to avoid a shifted list. */
  identityRefsComplete: boolean;
  slots: number[];
}

/**
 * PURE — derive the provider arrays from the aligned record list.
 *
 * Only slots with a wardrobe image can be emitted (the generator rejects an
 * empty portrait list). Identity refs are all-or-nothing across the emitted
 * slots: a gap suppresses the whole identity clause rather than shifting
 * later characters left. The gap itself is still reported per slot.
 */
export function buildAnchorImagePlan(
  records: CanonicalCastRecord[],
  maxCharacters = 4,
): AnchorImagePlan {
  const emitted = (records ?? [])
    .filter((r) => !!r.wardrobeReferenceUrl)
    .slice(0, Math.max(0, maxCharacters));

  const identityRefPresentBySlot = emitted.map((r) => !!r.identityReferenceUrl);
  const identityRefsComplete = emitted.length > 0 && identityRefPresentBySlot.every(Boolean);

  // Slot-bound and SPARSE: only characters that actually have a reference
  // appear, each carrying the position of its own primary image.
  const identityReferences: AnchorIdentityReference[] = [];
  emitted.forEach((r, i) => {
    if (!r.identityReferenceUrl) return;
    identityReferences.push({
      slot: i,
      castSlot: r.slot,
      characterId: r.characterId,
      characterName: r.name,
      url: r.identityReferenceUrl,
    });
  });

  return {
    portraitUrls: emitted.map((r) => r.wardrobeReferenceUrl as string),
    identityReferences,
    identityPortraitUrls: identityRefsComplete
      ? emitted.map((r) => r.identityReferenceUrl as string)
      : [],
    characterNames: emitted.map((r) => r.name),
    identityRefPresentBySlot,
    identityRefSourceBySlot: emitted.map((r) => r.source),
    identityRefsComplete,
    slots: emitted.map((r) => r.slot),
  };
}

// ── EVIDENCE ───────────────────────────────────────────────────────────────

export type EvidenceClass =
  | "biometric"
  | "vlm_high_margin"
  | "vlm_ambiguous"
  | "positional"
  | "inferred"
  /**
   * V534 — the ONE identity left over in a saturated detection where every
   * other identity is biometrically accepted. It is a set argument, not a
   * measurement, so it is NEVER a member of `STRICT_EVIDENCE_CLASSES` and
   * `evidenceSatisfiesStrict` is false for it globally — including in the
   * V514 recovery comparison. It is honoured only when the final strict
   * verification is handed an explicit V534 closure for exactly that
   * character.
   */
  | "deduced_closure"
  | "unverified";

/** Which measurement produced a confidence number. Never guessed. */
export type ConfidenceSemantics = "biometric" | "vlm" | "geometry";

/** ONLY biometric evidence satisfies the strict contract. */
export const STRICT_EVIDENCE_CLASSES: readonly EvidenceClass[] = ["biometric"];

export function evidenceSatisfiesStrict(c: EvidenceClass | null | undefined): boolean {
  return STRICT_EVIDENCE_CLASSES.includes(c as EvidenceClass);
}


/**
 * PURE — name the evidence honestly.
 *
 * A Hungarian assignment over centroid distance is `positional` no matter
 * how high its normalised score looks; `1 - dist/0.5 = 0.97` says the face
 * sits where the layout expected, not that it is the right person. The
 * last-slot/last-id fallback is `inferred`.
 */
export function classifySlotEvidence(input: {
  biometricAssigned?: boolean;
  rekognitionSimilarity?: number | null;
  vlmScore?: number | null;
  vlmMargin?: number | null;
  positional?: boolean;
  inferred?: boolean;
  vlmMarginFloor?: number;
}): EvidenceClass {
  if (input?.biometricAssigned === true) return "biometric";
  if (input?.inferred === true) return "inferred";

  const score = Number(input?.vlmScore);
  const margin = Number(input?.vlmMargin);
  const floor = Number.isFinite(Number(input?.vlmMarginFloor))
    ? Number(input?.vlmMarginFloor)
    : 0.15;
  if (Number.isFinite(score)) {
    // A high absolute score with no margin is an agreeable model, not
    // evidence. Only a clear separation from the runner-up counts.
    if (Number.isFinite(margin) && margin >= floor) return "vlm_high_margin";
    return "vlm_ambiguous";
  }

  if (input?.positional === true) return "positional";
  return "unverified";
}

// ── VERIFICATION ───────────────────────────────────────────────────────────

export interface StrictSlotEvidence {
  characterId: string;
  name: string;
  slot: number;
  strict: boolean;
  evidenceClass: EvidenceClass;
  rekognitionSimilarity: number | null;
}

export interface StrictVerificationVerdict {
  ok: boolean;
  expectedStrict: number;
  resolvedStrict: number;
  unresolved: Array<{ characterId: string; name: string; slot: number }>;
  evidence: StrictSlotEvidence[];
  reason: string | null;
  confidenceSemantics: ConfidenceSemantics;
}

/**
 * PURE — is every strict character present in the ACCEPTED biometric
 * assignment?
 *
 * `assignmentLock` is `resolveIdentityViaRekognition`'s accepted result:
 * slot -> characterId, already filtered by its own MIN_SIMILARITY. V508 does
 * not re-threshold it and does not read the raw similarities as a gate; the
 * similarity is carried for telemetry only.
 */
export function evaluateStrictVerification(
  records: CanonicalCastRecord[],
  assignmentLock: Record<string, unknown> | null | undefined,
  similarityByCharacterId?: Map<string, number | null> | null,
  /**
   * V534 — an explicit, single-character exhaustive closure. Only the FINAL
   * strict verification (after V514 convergence) ever passes this. Omitted
   * everywhere else, so recovery semantics are byte-for-byte unchanged.
   */
  v534Closure?: { characterId: string; faceIndex: number } | null,
): StrictVerificationVerdict {
  const lock = assignmentLock && typeof assignmentLock === "object" ? assignmentLock : {};
  const lockedIds = new Set(
    Object.values(lock).map((v) => str(v)).filter((v): v is string => !!v),
  );
  const slotByCharacterId = new Map<string, number>();
  for (const [k, v] of Object.entries(lock)) {
    const id = str(v);
    const slot = Number(k);
    if (id && Number.isFinite(slot)) slotByCharacterId.set(id, slot);
  }
  const closureId = str(v534Closure?.characterId);

  const evidence: StrictSlotEvidence[] = (records ?? []).map((r) => {
    const biometricAssigned = lockedIds.has(r.characterId);
    // A closure never overrides a biometric acceptance and never applies to
    // more than the one character it names.
    const closed = !biometricAssigned && closureId !== null && closureId === r.characterId;
    return {
      characterId: r.characterId,
      name: r.name,
      slot: slotByCharacterId.get(r.characterId) ?? r.slot,
      strict: isStrictRecord(r),
      evidenceClass: closed ? "deduced_closure" : classifySlotEvidence({ biometricAssigned }),
      rekognitionSimilarity: similarityByCharacterId?.get(r.characterId) ?? null,
    };
  });

  const strictEvidence = evidence.filter((e) => e.strict);
  const unresolved = strictEvidence
    .filter((e) => e.evidenceClass !== "deduced_closure" && !evidenceSatisfiesStrict(e.evidenceClass))
    .map((e) => ({ characterId: e.characterId, name: e.name, slot: e.slot }));

  const ok = unresolved.length === 0;
  return {
    ok,
    expectedStrict: strictEvidence.length,
    resolvedStrict: strictEvidence.length - unresolved.length,
    unresolved,
    evidence,
    reason: ok
      ? null
      : `strict_anchor_identity_unverified:${unresolved.map((u) => u.name || u.characterId).join(",")}`,
    confidenceSemantics: "biometric",

  };
}

/** PURE — names to feed the EXISTING face-lock retry for one targeted repair. */
export function strictRecoveryTargets(v: StrictVerificationVerdict): string[] {
  return (v?.unresolved ?? []).map((u) => u.name || u.characterId).filter((n) => n.length > 0);
}

// ── TELEMETRY ──────────────────────────────────────────────────────────────

/**
 * PURE — conditioning evidence, so a future incident never depends on a
 * console log that has aged out of retention. IDs, counts and booleans only:
 * no signed URLs are persisted.
 */
export function buildAnchorConditioningTelemetry(
  records: CanonicalCastRecord[],
  plan: AnchorImagePlan,
  opts?: { anchorModelRoute?: string | null; generatedAt?: string | null },
): Record<string, unknown> {
  const strict = (records ?? []).filter(isStrictRecord);
  return {
    version: V508_VERSION,
    character_count: records?.length ?? 0,
    portrait_count: plan.portraitUrls.length,
    // The COUNT is the structured list: a sparse set still conditions the
    // slots it covers. `identity_refs_complete` then distinguishes
    // "incomplete" from "none sent" — which the count alone cannot.
    identity_ref_count: plan.identityReferences.length,
    identity_refs_complete: plan.identityRefsComplete,
    identity_refs_sent: plan.identityReferences.length > 0,
    identity_ref_slots: plan.identityRefPresentBySlot.map((present, slot) => ({ slot, present })),
    legacy_identity_ref_count: plan.identityPortraitUrls.length,
    strict_count: strict.length,
    strict_identity_ref_count: strict.filter((r) => !!r.identityReferenceUrl).length,
    character_ids: (records ?? []).map((r) => r.characterId),
    identity_ref_present_by_slot: plan.identityRefPresentBySlot,
    identity_ref_source_by_slot: plan.identityRefSourceBySlot,
    anchor_model_route: str(opts?.anchorModelRoute),
    generated_at: str(opts?.generatedAt),
  };
}

/**
 * PURE — truthful identity telemetry.
 *
 * `compose-dialog-segments` persisted a GEOMETRY router result as
 * `identityMethod: "per-char-hungarian"` with `minMargin: 1` and
 * `ambiguous: false` hardcoded. A geometry router may never emit biometric
 * or VLM semantics, and it may never claim a margin it did not measure.
 */
export function buildIdentityTelemetry(input: {
  identityMethod: string;
  confidenceSemantics: ConfidenceSemantics;
  minConfidence?: number | null;
  minMargin?: number | null;
  ambiguous?: boolean | null;
  evidence?: StrictSlotEvidence[];
}): Record<string, unknown> {
  const geometry = input.confidenceSemantics === "geometry";
  return {
    version: V508_VERSION,
    identityMethod: input.identityMethod,
    confidenceSemantics: input.confidenceSemantics,
    minConfidence: Number.isFinite(Number(input.minConfidence)) ? Number(input.minConfidence) : null,
    // Geometry measures no margin and proves no unambiguity — say so.
    minMargin: geometry ? null : (Number.isFinite(Number(input.minMargin)) ? Number(input.minMargin) : null),
    ambiguous: geometry ? null : (typeof input.ambiguous === "boolean" ? input.ambiguous : null),
    evidence: input.evidence ?? [],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// V514 — MONOTONIC RECOVERY ACCEPTANCE
// ═══════════════════════════════════════════════════════════════════════════
//
// Scene 67b392b1, generation 13: strict verification resolved 3/4 (Samuel
// unresolved), the targeted recovery ran and produced a second anchor, and
// `reVerify` was still not ok — so the run correctly stopped for manual
// review.
//
// The acceptance test at the time was `if (reVerify.ok)`. That is right for a
// full pass and silent about everything else, which leaves the interesting
// cases undecided: a recovery that resolves four characters but rebinds one of
// them to the wrong person, or that trades Samuel for Kay and stays at 3/4.
// Both "look" like progress from a count alone.
//
// So the rule is not "did it improve the number" but "did it improve WITHOUT
// losing anything already proven". A recovery replaces authority only when it
// strictly increases the resolved strict count AND every character that was
// already biometrically verified stays verified AS THE SAME PERSON.
//
// Geometry never participates. A strict character is resolved by biometric
// evidence or not at all — see STRICT_EVIDENCE_CLASSES.

export type RecoveryRejectionReason =
  | "no_improvement"
  | "regressed_count"
  | "lost_verified_character"
  | "rebound_verified_character"
  | "expected_mismatch";

export interface RecoveryAcceptance {
  accept: boolean;
  reason: RecoveryRejectionReason | "improved";
  beforeResolved: number;
  afterResolved: number;
  expected: number;
  /** Characters verified before that are no longer verified after. */
  lost: string[];
  /** Characters verified before whose slot now names a DIFFERENT character. */
  rebound: Array<{ characterId: string; fromSlot: number; toCharacterId: string }>;
}

/** Slot -> characterId, for the strict characters that are biometrically verified. */
function verifiedSlotsOf(v: StrictVerificationVerdict): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of v.evidence ?? []) {
    if (!e || e.strict !== true) continue;
    if (!evidenceSatisfiesStrict(e.evidenceClass)) continue;
    if (typeof e.slot !== "number" || !e.characterId) continue;
    out.set(String(e.characterId), e.slot);
  }
  return out;
}

/**
 * PURE — may the recovery result replace the current authority?
 *
 * Fails closed: anything it cannot prove is an improvement is a rejection,
 * because the cost of a wrong accept is a rendered scene with a mis-identified
 * face, while the cost of a wrong reject is the manual review gate the user
 * already has.
 */
export function evaluateRecoveryAcceptance(
  before: StrictVerificationVerdict,
  after: StrictVerificationVerdict,
): RecoveryAcceptance {
  const beforeResolved = Number(before?.resolvedStrict ?? 0);
  const afterResolved = Number(after?.resolvedStrict ?? 0);
  const expected = Number(before?.expectedStrict ?? 0);

  const beforeVerified = verifiedSlotsOf(before);
  const afterVerified = verifiedSlotsOf(after);

  const lost: string[] = [];
  const rebound: RecoveryAcceptance["rebound"] = [];
  for (const [cid, slot] of beforeVerified) {
    if (!afterVerified.has(cid)) {
      lost.push(cid);
      // The slot this character held may now name someone else. That is a
      // rebind, not merely a loss, and it is the more dangerous of the two.
      for (const [otherCid, otherSlot] of afterVerified) {
        if (otherSlot === slot && otherCid !== cid) {
          rebound.push({ characterId: cid, fromSlot: slot, toCharacterId: otherCid });
        }
      }
    }
  }

  const base = { beforeResolved, afterResolved, expected, lost, rebound };

  // The two casts must describe the same thing at all, or the comparison is
  // meaningless and there is nothing to accept.
  if (Number(after?.expectedStrict ?? -1) !== expected) {
    return { accept: false, reason: "expected_mismatch", ...base };
  }
  // A verified character rebound to a different identity is the worst outcome
  // available and is reported as such even when the count went up.
  if (rebound.length > 0) {
    return { accept: false, reason: "rebound_verified_character", ...base };
  }
  if (lost.length > 0) {
    return { accept: false, reason: "lost_verified_character", ...base };
  }
  if (afterResolved < beforeResolved) {
    return { accept: false, reason: "regressed_count", ...base };
  }
  if (afterResolved === beforeResolved) {
    // Same count, nobody lost — a lateral move. Not worth replacing a proven
    // authority for, and 3/4 → a different 3/4 lands here.
    return { accept: false, reason: "no_improvement", ...base };
  }
  return { accept: true, reason: "improved", ...base };
}

/** PURE — bounded telemetry for the recovery decision. No URLs. */
export function buildRecoveryAcceptanceTelemetry(a: RecoveryAcceptance): Record<string, unknown> {
  return {
    v514_recovery_accepted: a.accept,
    v514_recovery_reason: a.reason,
    v514_resolved_before: a.beforeResolved,
    v514_resolved_after: a.afterResolved,
    v514_expected_strict: a.expected,
    v514_lost_characters: a.lost,
    v514_rebound_characters: a.rebound,
  };
}


// ═══════════════════════════════════════════════════════════════════════════
// V514 — STRICT RECOVERY FRAMING
// ═══════════════════════════════════════════════════════════════════════════
//
// Generation 13's framing retry reported `faces=4 humans=4` but
// `minFaceRatio=0.059, sizeOk=false` — every cast member was present and
// every face was too small for Rekognition to match at >= 55 similarity.
// The strict recovery that followed asked for face-lock but said nothing
// about how large those faces had to be, so it inherited the same staging.
//
// This directive fixes readability, not composition. It must NOT turn the
// scene into portraits: the anchor is the geometric ground truth for the
// whole downstream pipeline (V461 crop feasibility, V464 per-frame
// registration), and four mugshots would break the scene it is meant to
// anchor. Same cast, same world, same locked camera — tighter ensemble.
//
// Targets are named so the model knows which faces failed, but the
// requirement applies to EVERY cast member: fixing one face by hiding
// another would trade one unresolved character for the next.
export function buildStrictRecoveryFraming(unresolvedNames: string[]): string {
  const named = (unresolvedNames ?? []).map((n) => String(n).trim()).filter((n) => n.length > 0);
  const who = named.length > 0
    ? `The previous attempt rendered ${named.join(" and ")} too small or too obscured to identify. `
    : "The previous attempt rendered at least one cast member too small or too obscured to identify. ";
  return (
    ` STRICT IDENTITY FRAMING — ${who}` +
    "Keep the SAME scene, the SAME location, the SAME cast and the SAME actions. " +
    "Do NOT produce portraits, headshots or a photo montage. Restage the group " +
    "tighter: a waist-up medium ensemble shot in which EVERY cast member's face " +
    "is fully visible, frontal or near-frontal, and large enough to recognise. " +
    "No face may be hidden behind another person, turned away from camera, cropped " +
    "by the frame edge, or covered by a hand, hair or a prop. Every head must be " +
    "clearly separated from the others. The characters keep performing their " +
    "described actions — move them closer together and bring the camera in rather " +
    "than freezing them into a line-up."
  );
}