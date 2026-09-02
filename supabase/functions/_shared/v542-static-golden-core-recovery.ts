/**
 * V542 — 2-Sprecher Golden-Core Preclip Recovery (Zulässigkeitsregel).
 *
 * Belegter Produktionsbefund (Szene 7aa7fc93, Run ffcb59ed, Generation 6,
 * 2 Sprecher / 4 Turns, Assignment-Lock 2/2 vollständig):
 *
 *   - Pass 1 erreichte Sync.so und wurde dort verarbeitet.
 *   - Ein Sarah-Turn starb VOR dem Provider an `dynamic_mouth_crop_infeasible`
 *     mit einem Konflikt von ca. 2,24 px (288,74 > 286,50), bei einem als
 *     NICHT bewegt klassifizierten Kamerapfad.
 *   - Der zweite Sarah-Turn starb an `no_coherent_track_samples`: alle sechs
 *     Track-Samples wurden als `scale_incoherent` verworfen.
 *
 * Beides sind Aussagen über den DYNAMISCHEN Track, nicht über eine real
 * unmögliche Geometrie: derselbe Anker, dieselbe Identität und derselbe
 * statische Face-Center-Crop sind der gemessene Golden-Core (Run c934a823).
 *
 * Dieses Modul entscheidet EINE Frage: darf derselbe Turn nach genau diesen
 * beiden dynamischen Fehlerklassen ein zweites Mal mit dem statischen
 * Golden-Core-Crop gerendert werden?
 *
 * ABGRENZUNG (nicht verhandelbar):
 *   - Kein Threshold wird verändert. Der statische Versuch durchläuft den
 *     unveränderten V461-Face-/Containment-Vertrag; scheitert er dort, bleibt
 *     der bestehende Fail-Closed- und Refund-Pfad unberührt.
 *   - Kein Full-Plate-Fallback. Der Provider bekommt weiterhin ausschliesslich
 *     einen isolierten Sprecher-Preclip.
 *   - Nur 2 Sprecher. 1 Sprecher läuft nachweislich, 3+ bleibt unverändert.
 *   - Nur bei vollständigem Identity-Lock: ein unvollständiger oder
 *     mehrdeutiger Lock ist ein Identitätsproblem und darf nie durch Geometrie
 *     "repariert" werden.
 *   - Kein zweiter Provider-Call, kein Retry-Zähler, keine Preis-, Refund-,
 *     Lock-, FA-4- oder Webhook-Änderung.
 */

/** Genau die zwei belegten dynamischen Fehlerklassen — sonst keine. */
export const V542_RECOVERABLE_REASONS = [
  "dynamic_mouth_crop_infeasible",
  "no_coherent_track_samples",
] as const;

export const V542_RECOVERY_VERDICT = "v542_static_golden_core_recovery" as const;

export type V542RecoverableReason = (typeof V542_RECOVERABLE_REASONS)[number];

export interface V542RecoveryInput {
  /** Anzahl kanonischer Sprecher dieser Szene. */
  speakerCount: number;
  /** Fehlertext des dynamischen Preclip-Versuchs. */
  preclipError: string | null | undefined;
  /** Fehlerklasse des dynamischen Preclip-Versuchs. */
  preclipErrorClass: string | null | undefined;
  /** Anzahl identitätsgebundener, aufgelöster Slots (Assignment-Lock). */
  identityResolvedCount: number | null | undefined;
  /** Wurde für diesen Pass überhaupt ein dynamischer Pfad versucht? */
  dynamicAttempted: boolean;
}

export interface V542RecoveryDecision {
  eligible: boolean;
  /** Die erkannte dynamische Fehlerklasse, falls zutreffend. */
  matchedReason: V542RecoverableReason | null;
  /** Maschinenlesbarer Grund der Entscheidung. */
  reason: string;
}

function matchReason(error: string | null | undefined): V542RecoverableReason | null {
  const text = String(error ?? "");
  for (const candidate of V542_RECOVERABLE_REASONS) {
    if (text.includes(candidate)) return candidate;
  }
  return null;
}

/**
 * Rein funktional, ohne Seiteneffekte. `eligible === true` bedeutet
 * ausschliesslich: derselbe Turn darf EINMAL statisch erneut gerendert werden.
 */
export function evaluateV542Recovery(input: V542RecoveryInput): V542RecoveryDecision {
  const matchedReason = matchReason(input.preclipError);
  if (!input.dynamicAttempted) {
    return { eligible: false, matchedReason, reason: "no_dynamic_attempt" };
  }
  if (!matchedReason) {
    return { eligible: false, matchedReason: null, reason: "reason_not_recoverable" };
  }
  // `invalid_input` ist die Klasse, unter der beide belegten Fälle laufen.
  // Infrastruktur-/Dispatch-Fehler behalten ihren eigenen Pfad.
  const cls = String(input.preclipErrorClass ?? "");
  if (cls && cls !== "invalid_input") {
    return { eligible: false, matchedReason, reason: `error_class_not_recoverable:${cls}` };
  }
  if (Number(input.speakerCount) !== 2) {
    return { eligible: false, matchedReason, reason: "speaker_cohort_not_two" };
  }
  const resolved = Number(input.identityResolvedCount);
  if (!Number.isFinite(resolved) || resolved < 2) {
    return { eligible: false, matchedReason, reason: "identity_lock_incomplete" };
  }
  return { eligible: true, matchedReason, reason: "static_golden_core_permitted" };
}

/**
 * Sanitisierte Telemetrie: ausschliesslich Skalare und feste Etiketten —
 * keine Bilder, URLs, Boxen oder biometrischen Payloads.
 */
export function buildV542RecoveryDetails(args: {
  passIdx: number | null;
  totalPasses: number | null;
  matchedReason: V542RecoverableReason | null;
  outcome: "recovered" | "static_also_refused";
  speakerCount: number;
  identityResolvedCount: number | null;
}): Record<string, unknown> {
  return {
    v542: true,
    outcome: args.outcome,
    dynamic_reason: args.matchedReason,
    crop_source: "static_golden_core",
    full_plate_fallback: false,
    pass_idx: Number.isFinite(Number(args.passIdx)) ? Number(args.passIdx) : null,
    total_passes: Number.isFinite(Number(args.totalPasses)) ? Number(args.totalPasses) : null,
    speaker_count: Number(args.speakerCount),
    identity_resolved_count: Number.isFinite(Number(args.identityResolvedCount))
      ? Number(args.identityResolvedCount)
      : null,
  };
}
