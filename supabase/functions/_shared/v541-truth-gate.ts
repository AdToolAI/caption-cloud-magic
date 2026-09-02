/**
 * V541 — Wahrheits-Gate (Schritt 1 der Golden-Core-Reduktion).
 *
 * Belegtes Problem: Ein Pass, dessen Mundbewegung NICHT nachgewiesen werden
 * konnte (`motion_unverified`), wird über `ssw:success` durchgereicht und
 * erscheint anschliessend in der Datenbank als abgeschlossene Szene. Dadurch
 * meldet die Auswertung Erfolge, für die es keinen Bewegungsnachweis gibt.
 *
 * Dieses Modul führt genau EINE Unterscheidung ein:
 *
 *   verified      — Bewegung wurde gemessen und bestätigt.
 *   needs_review  — Der Pass lief durch, ohne dass Bewegung bewiesen wurde.
 *
 * Bewusste Abgrenzung (nicht verhandelbar für diesen Schritt):
 *   - KEINE Änderung an Schwellenwerten, Gates, Geometrie, Maske, Provider.
 *   - KEIN zusätzlicher Provider-Call, kein Retry, kein Refund-Eingriff.
 *   - KEINE Schema-Änderung: `needs_review` wird ausschliesslich als
 *     append-only Telemetrie und im HTTP-Response-Body sichtbar gemacht.
 *   - Der bestehende Write-Contract (`ssw:success`) bleibt unangetastet, weil
 *     ein abweichender Write-Id im RPC `write_id_mismatch` erzeugen und den
 *     Pass in endlosem Watchdog-Re-Forward hängen lassen würde.
 *
 * Auswertungsregel ab V541: Ein Run gilt nur dann als erfolgreich, wenn zu
 * ihm KEINE Beobachtung mit Verdict `V541_NEEDS_REVIEW_VERDICT` existiert.
 */

/** Telemetrie-Zustand eines durchgereichten, aber unbewiesenen Passes. */
export const V541_NEEDS_REVIEW_STATE = "needs_review" as const;

/** Verdict-Wert in `composer_callback_observations`. */
export const V541_NEEDS_REVIEW_VERDICT = "v541_needs_review" as const;

export type V541TruthState = "verified" | typeof V541_NEEDS_REVIEW_STATE;

export interface V541TruthInput {
  /**
   * True, wenn der Pass ausschliesslich deshalb als Erfolg weiterläuft, weil
   * Bewegung nicht messbar/nicht beweisbar war (V443/V458/V466/V500-B2).
   */
  motionUnverifiedPassthrough: boolean;
  /** Grund-Etikett des Durchreichens, rein beschreibend. */
  reason?: string | null;
}

export interface V541TruthResult {
  state: V541TruthState;
  /** True, wenn der Abschluss NICHT als bewiesener Erfolg gezählt werden darf. */
  needsReview: boolean;
  reason: string | null;
}

/**
 * Reine Funktion. Keine Seiteneffekte, kein IO, keine Verzweigung im
 * Produktionspfad ausser der Kennzeichnung des Ergebnisses.
 */
export function classifyPassTruth(input: V541TruthInput): V541TruthResult {
  if (input.motionUnverifiedPassthrough) {
    return {
      state: V541_NEEDS_REVIEW_STATE,
      needsReview: true,
      reason: input.reason ?? "motion_unverified",
    };
  }
  return { state: "verified", needsReview: false, reason: null };
}

/** Sanitisierte Telemetrie-Details — niemals URLs, Tokens oder Payloads. */
export function buildV541ReviewDetails(args: {
  passIdx: number | null;
  totalPasses: number | null;
  reason: string | null;
  source: "webhook" | "watchdog";
}): Record<string, unknown> {
  return {
    v541: true,
    truth_state: V541_NEEDS_REVIEW_STATE,
    source: args.source,
    pass_idx: Number.isFinite(args.passIdx as number) ? args.passIdx : null,
    total_passes: Number.isFinite(args.totalPasses as number) ? args.totalPasses : null,
    reason: args.reason ? String(args.reason).slice(0, 200) : null,
    counts_as_success: false,
  };
}
