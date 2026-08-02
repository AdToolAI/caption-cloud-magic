/**
 * preclip-identity-binding.ts — v396 Schritt 3
 * ═══════════════════════════════════════════════════════════════════════
 *
 * "Genau ein Gesicht erkannt" ist KEIN Identitätsbeweis. Es könnte das
 * einzige verbliebene Nachbargesicht sein, während die Zielperson den Crop
 * bereits verlassen hat — genau der belegte Kailee-/Sarah-Fall.
 *
 * Der Assignment-Lock enthält allein nur `Character-UUID → Face-Slot`.
 * Damit lässt sich nichts beweisen. Dieses Modul verlangt eine echte
 * Identitätsreferenz (Face-Embedding aus dem zugeordneten Anchor bzw. dem
 * Character-Referenzbild), vergibt Score und Margin zum zweitbesten
 * Kandidaten und liefert getrennte Verdicts:
 *
 *   matched            — Identität belegt
 *   face_not_detected  — überhaupt kein Gesicht im Preclip
 *   identity_ambiguous — bester Treffer zu knapp am zweitbesten
 *   wrong_identity     — bester Treffer gehört nachweislich einem anderen
 */

export type IdentityVerdictCode =
  | "matched"
  | "face_not_detected"
  | "identity_ambiguous"
  | "wrong_identity"
  | "identity_reference_missing";

/** Mindest-Ähnlichkeit (0..1), damit ein Kandidat überhaupt als Treffer gilt. */
export const MIN_IDENTITY_SCORE = 0.62;
/** Mindestabstand zwischen bestem und zweitbestem Kandidaten. */
export const MIN_IDENTITY_MARGIN = 0.08;

export interface IdentityCandidate {
  /** Index des Gesichts in der Detektionsliste des Frames. */
  faceIndex: number;
  /** Ähnlichkeit zur Referenz, 0..1. */
  score: number;
  /** Character, dem dieses Gesicht laut Rekognition-Collection gehört. */
  characterId: string | null;
  bbox: readonly [number, number, number, number];
  center: readonly [number, number];
}

export interface IdentityBindingInput {
  expectedCharacterId: string;
  /** ID des Anchors / Referenzbildes, gegen das gematcht wurde. */
  referenceAssetId: string | null;
  candidates: readonly IdentityCandidate[];
  minScore?: number;
  minMargin?: number;
}

export interface IdentityBinding {
  ok: boolean;
  code: IdentityVerdictCode;
  reason?: string;
  expected_character_uuid: string;
  matched_character_uuid: string | null;
  identity_score: number | null;
  second_best_score: number | null;
  identity_margin: number | null;
  reference_asset_id: string | null;
  /** Index des akzeptierten Gesichts, falls `ok`. */
  faceIndex: number | null;
}

export function bindPreclipIdentity(input: IdentityBindingInput): IdentityBinding {
  const minScore = input.minScore ?? MIN_IDENTITY_SCORE;
  const minMargin = input.minMargin ?? MIN_IDENTITY_MARGIN;
  const base = {
    expected_character_uuid: input.expectedCharacterId,
    reference_asset_id: input.referenceAssetId ?? null,
  };

  if (!input.referenceAssetId) {
    return {
      ...base,
      ok: false,
      code: "identity_reference_missing",
      reason:
        "no identity reference (anchor embedding / character reference image) was bound to this pass — " +
        "an assignment lock alone cannot prove who is in the preclip",
      matched_character_uuid: null,
      identity_score: null,
      second_best_score: null,
      identity_margin: null,
      faceIndex: null,
    };
  }

  const candidates = [...input.candidates].sort((a, b) => b.score - a.score);
  if (candidates.length === 0) {
    return {
      ...base,
      ok: false,
      code: "face_not_detected",
      reason: "no face detected on the rendered preclip",
      matched_character_uuid: null,
      identity_score: null,
      second_best_score: null,
      identity_margin: null,
      faceIndex: null,
    };
  }

  const best = candidates[0];
  const second = candidates[1] ?? null;
  const margin = second ? best.score - second.score : best.score;

  const shared = {
    ...base,
    matched_character_uuid: best.characterId ?? null,
    identity_score: best.score,
    second_best_score: second ? second.score : null,
    identity_margin: margin,
    faceIndex: best.faceIndex,
  };

  if (best.score < minScore) {
    return {
      ...shared,
      ok: false,
      // Zu schwach für eine Aussage — nicht "falsche Person", sondern
      // "keine belastbare Identifikation".
      code: "identity_ambiguous",
      reason: `best identity score ${best.score.toFixed(3)} is below the ${minScore} floor`,
      faceIndex: null,
    };
  }

  if (best.characterId && best.characterId !== input.expectedCharacterId) {
    return {
      ...shared,
      ok: false,
      code: "wrong_identity",
      reason:
        `the dominant face in the preclip resolves to ${best.characterId}, ` +
        `expected ${input.expectedCharacterId}`,
      faceIndex: null,
    };
  }

  if (second && margin < minMargin) {
    return {
      ...shared,
      ok: false,
      code: "identity_ambiguous",
      reason:
        `best ${best.score.toFixed(3)} vs second ${second.score.toFixed(3)} — ` +
        `margin ${margin.toFixed(3)} is below ${minMargin}; the crop contains two equally plausible faces`,
      faceIndex: null,
    };
  }

  return { ...shared, ok: true, code: "matched" };
}
