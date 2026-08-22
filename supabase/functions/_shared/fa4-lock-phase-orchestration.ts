// ── FA-4 v410 — Kein Medien-/AWS-I/O unter dem Dialog-Lock ───────────────────
//
// Frozen v404 §5: unter `withDialogLock` darf KEIN Lambda-Invoke, kein
// Still-Download, kein JPEG-Decode, kein HEAD-Probe und keine Motion-Messung
// laufen. Der Lock hat TTL 30 s ohne Renewal, die Messung bis zu 27 s Deadline
// — ein Messlauf unter Lock kann den Lease überleben und einen zweiten
// Callback in die kritische Sektion lassen.
//
// Lösung: die kritische Sektion wird in KURZE Zustands-/Entscheidungsphasen
// zerlegt. Braucht eine Phase blockierendes I/O, wirft sie eine
// `Fa4OutOfLockIoRequired`-Sentinel. `withDialogLock` gibt den Lease im
// `finally` frei, das I/O läuft AUSSERHALB, danach wird der Lock neu
// erworben und der Zustand erneut frisch gelesen und revalidiert.
//
// Diese Datei enthält nur reine Orchestrierung — keine DB-Autorität,
// kein Retry-, Mux- oder Apply-Pfad.

import type { SpeakerCardinality } from "./fa4-speaker-cardinality.ts";
import {
  decideCompletedSpeakerBranch,
  planUnderLockSpeakerMeasurement,
} from "./fa4-speaker-cardinality.ts";

export type Fa4OutOfLockIoRequest =
  | { kind: "measurement"; passIdx: number }
  | { kind: "media_probe"; headUrls: string[]; dimUrls: string[] };

/** Sentinel: die Locked-Phase braucht I/O, das NICHT unter Lock laufen darf. */
export class Fa4OutOfLockIoRequired extends Error {
  readonly request: Fa4OutOfLockIoRequest;
  constructor(request: Fa4OutOfLockIoRequest) {
    super(`fa4_out_of_lock_io_required:${request.kind}`);
    this.name = "Fa4OutOfLockIoRequired";
    this.request = request;
  }
}

export function isFa4OutOfLockIoRequired(e: unknown): e is Fa4OutOfLockIoRequired {
  return e instanceof Fa4OutOfLockIoRequired ||
    (typeof e === "object" && e !== null && (e as { name?: string }).name === "Fa4OutOfLockIoRequired");
}

/**
 * Reine Entscheidung für den COMPLETED-Zweig UNTER dem Lock.
 * `needs_catch_up_measurement` bedeutet ausdrücklich: Lock verlassen, messen,
 * neu erwerben — KEIN Apply, KEIN Mux, KEIN Retry in dieser Phase.
 */
export type UnderLockIoDecision =
  // v441 — COMPLETED + kein Output ⇒ `ssw:noop_fail` (die RPC-Matrix
  // akzeptiert `ssw:failed` nur für echte Provider-Fehler).
  | { action: "fail_closed"; writeId: "ssw:noop_fail"; errorText: string; reason: string }
  | { action: "single"; reason: string }
  | { action: "multi_apply"; reason: string }
  | { action: "needs_catch_up_measurement"; reason: string };

export function decideUnderLockIoAction(input: {
  fresh: SpeakerCardinality;
  preLockDeferred: boolean;
  hasMeasurement: boolean;
}): UnderLockIoDecision {
  const branch = decideCompletedSpeakerBranch(input.fresh);
  if (branch.branch === "fail_closed") {
    return {
      action: "fail_closed",
      writeId: branch.writeId,
      errorText: branch.errorText,
      reason: input.fresh.reason,
    };
  }
  if (branch.branch === "single") return { action: "single", reason: input.fresh.reason };

  const plan = planUnderLockSpeakerMeasurement({
    fresh: input.fresh,
    preLockDeferred: input.preLockDeferred,
    hasMeasurement: input.hasMeasurement,
  });
  if (plan.action === "measure") {
    return { action: "needs_catch_up_measurement", reason: plan.reason };
  }
  return { action: "multi_apply", reason: plan.reason };
}

export type Fa4PhaseRunOutcome<T> =
  | { outcome: "done"; result: T; rounds: number }
  | { outcome: "rounds_exhausted"; rounds: number; lastRequest: Fa4OutOfLockIoRequest };

/**
 * Führt kurze Locked-Phasen aus und erledigt angefordertes I/O strikt
 * ZWISCHEN den Phasen (Lock freigegeben). Vor jeder Wiederholung wird der
 * Zustand neu geladen, damit Phase 2 nie auf einem Vor-Mess-Snapshot
 * entscheidet.
 */
export async function runLockedPhasesWithOutOfLockIo<T>(opts: {
  /** MUSS die Phase in `withDialogLock` ausführen und deren Ergebnis liefern. */
  runLockedPhase: (round: number) => Promise<T>;
  /** Läuft garantiert OHNE Lock. */
  performOutOfLockIo: (request: Fa4OutOfLockIoRequest) => Promise<void>;
  /** Frischer State-Read vor dem erneuten Lock-Erwerb. */
  refreshBetweenRounds?: () => Promise<void>;
  maxRounds?: number;
}): Promise<Fa4PhaseRunOutcome<T>> {
  const maxRounds = opts.maxRounds ?? 3;
  let lastRequest: Fa4OutOfLockIoRequest | null = null;

  for (let round = 1; round <= maxRounds; round++) {
    try {
      const result = await opts.runLockedPhase(round);
      return { outcome: "done", result, rounds: round };
    } catch (e) {
      if (!isFa4OutOfLockIoRequired(e)) throw e;
      lastRequest = (e as Fa4OutOfLockIoRequired).request;
      await opts.performOutOfLockIo(lastRequest);
      if (opts.refreshBetweenRounds) await opts.refreshBetweenRounds();
    }
  }

  return { outcome: "rounds_exhausted", rounds: maxRounds, lastRequest: lastRequest! };
}
