/**
 * V534 — EXHAUSTIVE ANCHOR IDENTITY CLOSURE (PURE)
 * ---------------------------------------------------------------------------
 * Production problem (scene 67b392b1, generation 33):
 *
 *   expectedCount 4, detectedCount 4, resolvedCount 3.
 *   Three strict characters biometrically accepted on three distinct faces,
 *   one face left with no owner, one requested character left with no face.
 *   The strict gate reported `strict_anchor_identity_unverified:Samuel
 *   Dusatko` and the scene parked in `awaiting_manual_face_map` — every
 *   generation again, because each fresh anchor re-rolls the pose.
 *
 * The remaining identity is not a guess: in a SATURATED detection
 * (detected === expected) with exactly one gap on each side, set arithmetic
 * leaves exactly one possibility. V534 admits THAT and nothing else.
 *
 * WHAT THIS MODULE IS NOT
 *
 *   - Not a threshold. `MIN_SIMILARITY` 55 / `MIN_SIMILARITY_PASS2` 45 live
 *     in `resolveIdentityViaRekognition` and are neither read nor lowered
 *     here. `bestSimilarity` is diagnostic only and never a gate.
 *   - Not geometry. The V278 `anchor_face_layout` character labels are
 *     positional and Gen33 proved they can contradict biometrics. This
 *     module never reads them.
 *   - Not a VLM. No Gemini, no Nano Banana, no second opinion.
 *
 * FAIL-CLOSED BY CONSTRUCTION: every predicate below must hold. Anything
 * else returns a refusal and the caller keeps its existing
 * `awaiting_manual_face_map` behaviour untouched.
 *
 * COORDINATE SPACE (verified against current source)
 *   `characterDiagnostics[].bestFaceIndex` is the column index of the score
 *   matrix, whose columns are `detected[j]`, and `faces[j].slot === j`.
 *   `bestFaceIndex` and `ResolvedIdentityFace.slot` are therefore the SAME
 *   DetectFaces index space.
 */

import type {
  CharacterIdentityDiagnostic,
  RekognitionIdentityResult,
} from "./resolveIdentityViaRekognition.ts";

export const V534_VERSION = "v534";

/** Bounded diagnostic source label for the persisted provenance object. */
export const V534_CLOSURE_LOCK_SOURCE = "v274_anchor_rekognition_closure";

export type V534RefusalReason =
  | "resolver_not_ok"
  | "technical_resolver_reason"
  | "cohort_too_small"
  | "detected_count_mismatch"
  | "face_count_mismatch"
  | "resolved_count_not_n_minus_one"
  | "unassigned_face_count_not_one"
  | "missing_character_count_not_one"
  | "accepted_sets_inconsistent"
  | "diagnostics_missing"
  | "portrait_load_failed"
  | "compare_not_attempted"
  | "compare_failed"
  | "diagnostic_reason_refused"
  | "best_face_unmeasured"
  | "contradictory_biometric_evidence"
  | "speaker_index_unknown"
  | "speaker_index_occupied";

/** One requested cast entry, exactly as handed to the resolver. */
export interface V534CastEntry {
  characterId: string;
  speakerIdx: number;
}

export interface V534Closure {
  characterId: string;
  /** DetectFaces slot of the sole leftover face. */
  faceIndex: number;
  /** Cast/speaker index — the `assignmentLock` KEY space, not a face slot. */
  speakerIdx: number;
  /** Diagnostic only. Never an acceptance gate. */
  bestSimilarity: number | null;
  source: typeof V534_CLOSURE_LOCK_SOURCE;
}

export interface V534Decision {
  applied: boolean;
  reason: V534RefusalReason | "closed";
  /** Present only when `applied`. */
  closure: V534Closure | null;
  /** Bounded counters for telemetry. No URLs, no payloads, no image bytes. */
  detail: {
    expectedCount: number;
    detectedCount: number | null;
    resolvedCount: number;
    unassignedFaceCount: number;
    missingCharacterCount: number;
  };
}

/** Resolver-level reasons that mean nothing was measured. */
function isTechnicalResolverReason(reason: string | null | undefined): boolean {
  const r = typeof reason === "string" ? reason.trim() : "";
  if (!r) return false;
  if (r === "detect_zero_faces") return true;
  if (r.startsWith("detect_failed")) return true;
  if (r === "assignment_budget_exceeded") return true;
  if (r === "anchor_fetch_failed") return true;
  if (r === "aws_credentials_missing") return true;
  if (r === "empty_input") return true;
  return false;
}

/** Per-character reasons that are a refusal, not a low score. */
const REFUSED_DIAGNOSTIC_REASONS = new Set<string>([
  "portrait_load_failed",
  "compare_failed",
  "no_faces_detected",
  "ambiguous",
  "assignment_budget_exceeded",
]);

const asId = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length > 0 ? s : null;
};

/**
 * PURE — may the single remaining identity be closed by exhaustion?
 *
 * `cast` is the SAME ordered list that was handed to the resolver, so the
 * `speakerIdx` it carries is the authoritative `assignmentLock` key space.
 */
export function evaluateExhaustiveClosure(
  resolution: RekognitionIdentityResult | null | undefined,
  cast: readonly V534CastEntry[] | null | undefined,
): V534Decision {
  const faces = Array.isArray(resolution?.faces) ? resolution!.faces : [];
  const lockRaw = (resolution?.assignmentLock ?? {}) as Record<string, unknown>;
  const expectedCount = Number(resolution?.expectedCount ?? 0);
  const detectedCount = resolution?.detectedCount == null
    ? null
    : Number(resolution.detectedCount);
  const resolvedCount = Number(resolution?.resolvedCount ?? 0);

  const acceptedFaceIds = faces
    .map((f) => asId(f?.characterId))
    .filter((v): v is string => !!v);
  const unassignedFaces = faces.filter((f) => !asId(f?.characterId));
  const lockedIds = Object.values(lockRaw)
    .map((v) => asId(v))
    .filter((v): v is string => !!v);
  const castList = (Array.isArray(cast) ? cast : [])
    .map((c) => ({ characterId: asId(c?.characterId), speakerIdx: Number(c?.speakerIdx) }))
    .filter((c): c is V534CastEntry => !!c.characterId && Number.isFinite(c.speakerIdx));
  const acceptedSet = new Set(acceptedFaceIds);
  const missing = castList.filter((c) => !acceptedSet.has(c.characterId));

  const detail: V534Decision["detail"] = {
    expectedCount,
    detectedCount,
    resolvedCount,
    unassignedFaceCount: unassignedFaces.length,
    missingCharacterCount: missing.length,
  };
  const refuse = (reason: V534RefusalReason): V534Decision => ({
    applied: false,
    reason,
    closure: null,
    detail,
  });

  // 1 — a resolver that did not produce a result proves nothing.
  if (!resolution || resolution.ok !== true) return refuse("resolver_not_ok");
  if (isTechnicalResolverReason(resolution.reason)) return refuse("technical_resolver_reason");

  // 2 — a cohort of one can never be closed by exhaustion.
  if (!(expectedCount >= 2)) return refuse("cohort_too_small");

  // 3/4 — saturated detection, and the face list must describe it.
  if (detectedCount === null || detectedCount !== expectedCount) {
    return refuse("detected_count_mismatch");
  }
  if (faces.length !== expectedCount) return refuse("face_count_mismatch");

  // 5 — exactly one gap.
  if (resolvedCount !== expectedCount - 1) return refuse("resolved_count_not_n_minus_one");
  if (unassignedFaces.length !== 1) return refuse("unassigned_face_count_not_one");
  if (castList.length !== expectedCount) return refuse("missing_character_count_not_one");
  if (missing.length !== 1) return refuse("missing_character_count_not_one");

  // 8 — the accepted side must be injective and self-consistent.
  if (acceptedFaceIds.length !== expectedCount - 1) return refuse("accepted_sets_inconsistent");
  if (acceptedSet.size !== acceptedFaceIds.length) return refuse("accepted_sets_inconsistent");
  const lockedSet = new Set(lockedIds);
  if (lockedIds.length !== lockedSet.size) return refuse("accepted_sets_inconsistent");
  if (lockedSet.size !== acceptedSet.size) return refuse("accepted_sets_inconsistent");
  for (const id of acceptedSet) {
    if (!lockedSet.has(id)) return refuse("accepted_sets_inconsistent");
  }

  const target = missing[0];
  const leftover = unassignedFaces[0];
  const leftoverSlot = Number(leftover?.slot);
  if (!Number.isFinite(leftoverSlot)) return refuse("accepted_sets_inconsistent");

  // 9 — the missing character must have been genuinely measured.
  const diagnostics: CharacterIdentityDiagnostic[] = Array.isArray(resolution.characterDiagnostics)
    ? resolution.characterDiagnostics
    : [];
  const diag = diagnostics.find((d) => asId(d?.characterId) === target.characterId) ?? null;
  if (!diag) return refuse("diagnostics_missing");
  if (diag.portraitLoaded !== true) return refuse("portrait_load_failed");
  if (diag.compareAttempted !== true) return refuse("compare_not_attempted");
  if (diag.compareOk !== true) return refuse("compare_failed");
  if (REFUSED_DIAGNOSTIC_REASONS.has(String(diag.reason ?? ""))) {
    return refuse("diagnostic_reason_refused");
  }

  // 10 — HARDENING. `Number(null) === 0` would silently name face slot 0, so
  // the nullish check happens BEFORE any numeric coercion.
  const rawBest = diag.bestFaceIndex;
  if (rawBest === null || rawBest === undefined) return refuse("best_face_unmeasured");
  const bestFaceIndex = Number(rawBest);
  if (!Number.isFinite(bestFaceIndex)) return refuse("best_face_unmeasured");
  if (bestFaceIndex !== leftoverSlot) {
    // Points at a face somebody else already owns — biometric evidence that
    // contradicts the exhaustion argument. Similarity comparisons against the
    // holder are deliberately NOT consulted: they would be a permissive
    // condition, and V534 has none.
    return refuse("contradictory_biometric_evidence");
  }

  // 11 — the lock key must be derivable and currently free.
  if (!Number.isFinite(target.speakerIdx)) return refuse("speaker_index_unknown");
  if (Object.prototype.hasOwnProperty.call(lockRaw, String(target.speakerIdx))) {
    return refuse("speaker_index_occupied");
  }

  return {
    applied: true,
    reason: "closed",
    closure: {
      characterId: target.characterId,
      faceIndex: leftoverSlot,
      speakerIdx: target.speakerIdx,
      bestSimilarity: diag.bestSimilarity ?? null,
      source: V534_CLOSURE_LOCK_SOURCE,
    },
    detail,
  };
}

/**
 * PURE — a copy of the resolution with the ONE deduced identity placed.
 *
 * `resolvedCount` is deliberately NOT incremented: it counts biometrically
 * resolved identities and must keep saying 3. `assignmentLockSource` is not
 * written here either — the caller keeps the underlying partial authority
 * label and records V534 provenance separately.
 */
export function applyExhaustiveClosure(
  resolution: RekognitionIdentityResult,
  closure: V534Closure,
): RekognitionIdentityResult {
  const faces = resolution.faces.map((f) =>
    Number(f.slot) === closure.faceIndex && !asId(f.characterId)
      ? { ...f, characterId: closure.characterId }
      : { ...f }
  );
  return {
    ...resolution,
    faces,
    assignmentLock: {
      ...resolution.assignmentLock,
      [String(closure.speakerIdx)]: closure.characterId,
    },
    // resolvedCount stays at the biometric count. See doc comment.
    resolvedCount: resolution.resolvedCount,
  };
}

/** PURE — bounded provenance object for `strict_identity.v534_closure`. */
export function buildV534Telemetry(decision: V534Decision) {
  return {
    version: V534_VERSION,
    applied: decision.applied,
    reason: decision.reason,
    lock_source: decision.applied ? V534_CLOSURE_LOCK_SOURCE : null,
    character_id: decision.closure?.characterId ?? null,
    face_index: decision.closure?.faceIndex ?? null,
    speaker_idx: decision.closure?.speakerIdx ?? null,
    best_similarity: decision.closure?.bestSimilarity ?? null,
    expected_count: decision.detail.expectedCount,
    detected_count: decision.detail.detectedCount,
    biometric_resolved_count: decision.detail.resolvedCount,
    unassigned_face_count: decision.detail.unassignedFaceCount,
    missing_character_count: decision.detail.missingCharacterCount,
  };
}
