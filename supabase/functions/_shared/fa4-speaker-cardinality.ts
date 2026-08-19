// ── FA-4 v409 — Speaker-Cardinality (PURE) ───────────────────────────────────
// Bug (v408 und früher): `sync-so-webhook` leitete die Sprecher-Klasse aus der
// PASS-Kardinalität ab (`total_passes > 1` bzw. `totalPasses === 1`). Der
// default-ON Per-Turn-Split in `compose-dialog-segments` erzeugt aber pro TURN
// einen eigenen Pass und behält dabei denselben `speaker_idx`. Eine Szene mit
// EINEM Sprecher und zwei Turns wurde dadurch als Multi-Speaker klassifiziert:
// serverseitige deltaMean-Messung lief an, Multi-Speaker-NOOP/INDETERMINATE
// griffen, und das v231-Einzelsprecher-Gate fiel weg.
//
// Kanonische Regel: Sprecher-Kardinalität = Anzahl DISTINKTER endlicher
// `speaker_idx`-Identitäten im aktuellen v5-Pass-Set. NICHT Pass-Anzahl,
// NICHT `total_passes`, NICHT Job-Anzahl, NICHT Turn-Anzahl, NICHT Pass-Index.
//
// Stabilizer-Passes (v194) verwenden den `speaker_idx` ihres Listeners wieder
// und können die Kardinalität daher gar nicht aufblähen. Defensiv werden sie
// trotzdem ignoriert, solange mindestens ein Nicht-Stabilizer-Pass existiert —
// neue Sprecher-Identitäten werden dabei NIEMALS erfunden.

export type SpeakerCardinalityClass = "single" | "multi" | "unknown";

export interface SpeakerCardinality {
  distinctSpeakerCount: number;
  speakerIndices: number[];
  classification: SpeakerCardinalityClass;
  isSingleSpeaker: boolean;
  isMultiSpeaker: boolean;
  isUnknown: boolean;
  /** Nur zur Forensik: reine Pass-Kardinalität (entscheidet NICHTS). */
  totalPasses: number;
  reason: string;
}

function isStabilizerPass(p: unknown): boolean {
  if (!p || typeof p !== "object") return false;
  const o = p as Record<string, unknown>;
  return o.is_silent_stabilizer === true || o.stabilizer_pass === true;
}

function readSpeakerIdx(p: unknown): number | null {
  if (!p || typeof p !== "object") return null;
  const raw = (p as Record<string, unknown>).speaker_idx;
  if (typeof raw !== "number") return null;
  if (!Number.isFinite(raw) || !Number.isInteger(raw) || raw < 0) return null;
  return raw;
}

/** Sortierte, eindeutige, endliche ganzzahlige `speaker_idx`-Werte. */
export function distinctSpeakerIndices(passes: unknown): number[] {
  const list = Array.isArray(passes) ? passes : [];
  const active = list.some((p) => !isStabilizerPass(p))
    ? list.filter((p) => !isStabilizerPass(p))
    : list;
  const set = new Set<number>();
  for (const p of active) {
    const idx = readSpeakerIdx(p);
    if (idx !== null) set.add(idx);
  }
  return [...set].sort((a, b) => a - b);
}

/**
 * Klassifiziert die Sprecher-Kardinalität eines v5-Pass-Sets.
 *
 * Kompatibilitätsregel (fail-closed):
 *  - distinctSpeakerCount === 1                      → single
 *  - distinctSpeakerCount >= 2                       → multi
 *  - distinctSpeakerCount === 0 && totalPasses === 1 → single (historisch)
 *  - distinctSpeakerCount === 0 && totalPasses > 1   → unknown (NIE multi!)
 */
export function classifySpeakerCardinality(
  passes: unknown,
  opts?: { totalPasses?: number },
): SpeakerCardinality {
  const list = Array.isArray(passes) ? passes : [];
  const speakerIndices = distinctSpeakerIndices(list);
  const distinctSpeakerCount = speakerIndices.length;
  const rawTotal = Number(opts?.totalPasses ?? list.length);
  const totalPasses = Number.isFinite(rawTotal) && rawTotal > 0
    ? Math.trunc(rawTotal)
    : list.length;

  let classification: SpeakerCardinalityClass;
  let reason: string;
  if (distinctSpeakerCount === 1) {
    classification = "single";
    reason = "distinct_speaker_idx_1";
  } else if (distinctSpeakerCount >= 2) {
    classification = "multi";
    reason = `distinct_speaker_idx_${distinctSpeakerCount}`;
  } else if (totalPasses <= 1) {
    classification = "single";
    reason = "legacy_single_pass_without_speaker_idx";
  } else {
    classification = "unknown";
    reason = "speaker_idx_missing_on_multi_pass_state";
  }

  return {
    distinctSpeakerCount,
    speakerIndices,
    classification,
    isSingleSpeaker: classification === "single",
    isMultiSpeaker: classification === "multi",
    isUnknown: classification === "unknown",
    totalPasses,
    reason,
  };
}

/** Nur echte Multi-Speaker-Szenen dürfen die Server-Motion-Messung auslösen. */
export function shouldRunMultiSpeakerMotionMeasurement(
  cardinality: SpeakerCardinality,
): boolean {
  return cardinality.isMultiSpeaker;
}

export const SPEAKER_CARDINALITY_INDETERMINATE_ERROR = "speaker_cardinality_indeterminate";

export type CompletedSpeakerBranch =
  | { branch: "single"; runMotionMeasurement: false }
  | { branch: "multi"; runMotionMeasurement: true }
  | {
    branch: "fail_closed";
    runMotionMeasurement: false;
    writeId: "ssw:failed";
    errorText: typeof SPEAKER_CARDINALITY_INDETERMINATE_ERROR;
  };

/**
 * Entscheidung für den COMPLETED-Zweig des Webhooks. `unknown` failt closed
 * über den bestehenden G3.2.2-Apply (`ssw:failed`) — kein Retry, kein Mux.
 */
export function decideCompletedSpeakerBranch(
  cardinality: SpeakerCardinality,
): CompletedSpeakerBranch {
  if (cardinality.isMultiSpeaker) return { branch: "multi", runMotionMeasurement: true };
  if (cardinality.isSingleSpeaker) return { branch: "single", runMotionMeasurement: false };
  return {
    branch: "fail_closed",
    runMotionMeasurement: false,
    writeId: "ssw:failed",
    errorText: SPEAKER_CARDINALITY_INDETERMINATE_ERROR,
  };
}
