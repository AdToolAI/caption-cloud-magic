/**
 * v431 G3.1 — Job-Ledger als Provenienz-Quelle (Observe-Phase).
 *
 * D2 (G3.0b): `composer_pipeline_jobs` ist ab G3.2 die ALLEINIGE Quelle der
 * Run-Provenienz eines Callbacks. G3.1 baut dafür ausschließlich die Daten auf:
 *
 *   • `acquireLedgerJob()` legt die Job-Zeile VOR dem Provider-Call an und
 *     friert `plate_generation` aus dem Szenen-Snapshot ein.
 *   • Die zurückgegebene `id` wird als `pipeline_job_id` in den Callback-Kanal
 *     transportiert (Sync.so-URL, Remotion-customData, Replicate-Webhook-URL,
 *     Mux-Request-Body).
 *   • `observeCallbackProvenance()` liest die Bindung im Callback, loggt sie
 *     strukturiert — und schreibt NICHTS. Kein Handler-Verhalten ändert sich.
 *
 * Fail-open ist in G3.1 Pflicht: jede Störung dieses Moduls darf einen echten
 * Render niemals blockieren. Fail-closed kommt erst in G3.2, nachdem das
 * Drain-Gate (0 Callbacks ohne Ledger-Bindung über das Drain-Fenster) grün ist.
 */

import { V427_RUN_CONTRACT_VERSION } from "./v427-flags.ts";
import type { PipelineStage } from "./composer-pipeline-jobs.ts";

export const V431_OBSERVE_TAG = "[v431] g31_observe";

export interface AcquireLedgerJobParams {
  sceneId: string;
  /** Kanonischer Scene-Run. Fehlt er, wird nichts geschrieben. */
  runId: string | null | undefined;
  stage: PipelineStage;
  /** Aus dem Szenen-Snapshot; wird beim Insert eingefroren (D2). */
  plateGeneration?: number | null;
  provider?: string | null;
  segmentId?: string | null;
  speakerId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface LedgerJobHandle {
  id: string;
  attemptNo: number;
  runId: string;
  plateGeneration: number | null;
}

/**
 * G3.1b — Ergebnis der Initial-Akquise als Discriminated Union.
 *
 * `acquired`          → diese Zeile gehört dem Aufrufer, er darf dispatchen.
 * `already_in_flight` → ein aktiver Attempt derselben Identität existiert
 *                       bereits (auch `dispatch_uncertain`). Der Aufrufer darf
 *                       NICHT dispatchen. Ein Redispatch ist ausschließlich
 *                       über den expliziten Retry-/Replace-Vertrag zulässig.
 * `unavailable`       → Ledger nicht verfügbar / keine belastbare Provenienz.
 *                       Fail-open: der Legacy-Pfad läuft unverändert weiter.
 */
export type LedgerAcquireResult =
  | { outcome: "acquired"; job: LedgerJobHandle }
  | { outcome: "already_in_flight"; job: LedgerJobHandle; status: string | null }
  | { outcome: "unavailable"; reason: string };

function keyOf(p: {
  sceneId: string;
  runId: string;
  stage: PipelineStage;
  segmentId?: string | null;
  attemptNo: number;
}): string {
  return [p.sceneId, p.runId, p.stage, p.segmentId ?? "-", String(p.attemptNo)].join(":");
}

/** Deterministischer Idempotenz-Schlüssel derselben Attempt-Identität. */
export const buildLedgerIdempotencyKey = keyOf;

/**
 * Initial-Akquise der Ledger-Zeile für genau diesen Dispatch.
 *
 * Diese Funktion löst NIEMALS einen laufenden Attempt ab. Existiert bereits ein
 * aktiver Attempt derselben (scene, run, stage, segment, generation), lautet das
 * Verdikt `already_in_flight` — `composer_replace_pipeline_attempt` wird dabei
 * nicht aufgerufen.
 *
 * Concurrency-Vertrag: zwei gleichzeitige Aufrufe derselben Identität ergeben
 * deterministisch genau einmal `acquired` und einmal `already_in_flight`. Das
 * garantiert das RPC `composer_acquire_pipeline_attempt` über
 * `ON CONFLICT ON CONSTRAINT composer_pipeline_jobs_identity_unique DO NOTHING`
 * plus Re-Read der Gewinnerzeile. Der Verlierer bekommt nie `unavailable`.
 */
export async function acquireLedgerJob(
  admin: any,
  params: AcquireLedgerJobParams,
): Promise<LedgerAcquireResult> {
  try {
    const runId = params.runId ? String(params.runId) : null;
    if (!runId) {
      console.warn(`${V431_OBSERVE_TAG} ledger_skip_no_run`, JSON.stringify({
        scene_id: params.sceneId,
        stage: params.stage,
      }));
      return { outcome: "unavailable", reason: "no_run" };
    }

    let plateGeneration = params.plateGeneration ?? null;
    if (plateGeneration == null) {
      const { data: scene } = await admin
        .from("composer_scenes")
        .select("plate_generation, active_run_id")
        .eq("id", params.sceneId)
        .maybeSingle();
      if (scene && String(scene.active_run_id ?? "") !== runId) {
        console.warn(`${V431_OBSERVE_TAG} ledger_skip_run_superseded`, JSON.stringify({
          scene_id: params.sceneId,
          stage: params.stage,
          dispatch_run_id: runId,
          scene_active_run_id: scene.active_run_id ?? null,
        }));
        return { outcome: "unavailable", reason: "run_superseded" };
      }
      plateGeneration = typeof scene?.plate_generation === "number" ? scene.plate_generation : null;
    }

    // `plate_generation` ist DB-seitig beim INSERT Pflicht. Ohne belastbare
    // Generation wird gar keine Ledger-Zeile erzeugt (fail-closed gegenüber dem
    // Ledger, fail-open gegenüber dem Render).
    if (plateGeneration == null) {
      console.warn(`${V431_OBSERVE_TAG} ledger_skip_no_generation`, JSON.stringify({
        scene_id: params.sceneId,
        stage: params.stage,
        run_id: runId,
      }));
      return { outcome: "unavailable", reason: "no_generation" };
    }

    const { data, error } = await admin.rpc("composer_acquire_pipeline_attempt", {
      p_scene_id: params.sceneId,
      p_run_id: runId,
      p_stage: params.stage,
      p_plate_generation: plateGeneration,
      p_run_contract_version: V427_RUN_CONTRACT_VERSION,
      p_segment_id: params.segmentId ?? null,
      p_speaker_id: params.speakerId ?? null,
      p_provider: params.provider ?? null,
      p_metadata: { ...(params.metadata ?? {}), ledger_source: "v431_g31" },
    });

    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row?.job_id) {
      console.warn(`${V431_OBSERVE_TAG} ledger_acquire_failed`, JSON.stringify({
        scene_id: params.sceneId,
        stage: params.stage,
        error: error?.message ?? "no_row",
      }));
      return { outcome: "unavailable", reason: "acquire_failed" };
    }

    const job: LedgerJobHandle = {
      id: String(row.job_id),
      attemptNo: Number(row.attempt_no ?? 1),
      runId,
      plateGeneration,
    };

    if (String(row.outcome) === "already_in_flight") {
      console.warn(`${V431_OBSERVE_TAG} ledger_already_in_flight`, JSON.stringify({
        scene_id: params.sceneId,
        stage: params.stage,
        run_id: runId,
        segment_id: params.segmentId ?? null,
        pipeline_job_id: job.id,
        attempt_no: job.attemptNo,
        existing_status: row.status ?? null,
      }));
      return { outcome: "already_in_flight", job, status: row.status ? String(row.status) : null };
    }

    return { outcome: "acquired", job };
  } catch (e) {
    console.warn(`${V431_OBSERVE_TAG} ledger_acquire_threw`, JSON.stringify({
      scene_id: params.sceneId,
      stage: params.stage,
      error: e instanceof Error ? e.message : String(e),
    }));
    return { outcome: "unavailable", reason: "threw" };
  }
}


/**
 * Verknüpft die externe Provider-Job-ID mit der Ledger-Zeile.
 * Der DB-Trigger macht `external_job_id` nach dem ersten Setzen unveränderlich.
 */
export async function bindLedgerExternalJob(
  admin: any,
  jobId: string | null | undefined,
  externalJobId: string | null | undefined,
): Promise<void> {
  if (!jobId) return;
  try {
    const patch: Record<string, unknown> = { status: "dispatched" };
    if (externalJobId) patch.external_job_id = String(externalJobId);
    await admin
      .from("composer_pipeline_jobs")
      .update(patch)
      .eq("id", jobId)
      .in("status", ["pending", "dispatching"]);
  } catch (e) {
    console.warn(`${V431_OBSERVE_TAG} ledger_bind_failed`, JSON.stringify({
      pipeline_job_id: jobId,
      error: e instanceof Error ? e.message : String(e),
    }));
  }
}

/**
 * G3.1b — Dispatch-Failure-Semantik (Ledger-only).
 *
 * `rejected`  → der Provider hat den Auftrag nachweislich NICHT angenommen
 *               (4xx, Validierungsfehler, Abbruch vor dem Absenden) ⇒ `failed`.
 * `uncertain` → Ausgang unklar (Timeout, abgebrochener Fetch, 5xx, unbekannte
 *               Antwort, Function-Kill) ⇒ `dispatch_uncertain`, recoverable.
 *
 * Wirkt nur aus `pending`/`dispatching`; niemals über `dispatched`/`succeeded`
 * hinweg. Fasst ausschließlich `composer_pipeline_jobs` an — kein State-,
 * Output-, Mirror- oder Credit-Effekt.
 */
export async function settleLedgerDispatchFailure(
  admin: any,
  jobId: string | null | undefined,
  opts: { errorCode: string; outcome: "rejected" | "uncertain" },
): Promise<void> {
  if (!jobId) return;
  try {
    await admin
      .from("composer_pipeline_jobs")
      .update({
        status: opts.outcome === "rejected" ? "failed" : "dispatch_uncertain",
        error_code: opts.errorCode.slice(0, 120),
        completed_at: opts.outcome === "rejected" ? new Date().toISOString() : null,
      })
      .eq("id", jobId)
      .in("status", ["pending", "dispatching"]);
  } catch (e) {
    console.warn(`${V431_OBSERVE_TAG} ledger_settle_failed`, JSON.stringify({
      pipeline_job_id: jobId,
      outcome: opts.outcome,
      error: e instanceof Error ? e.message : String(e),
    }));
  }
}

/**
 * Konservative Klassifikation eines Dispatch-Fehlers.
 *
 * Nur eine nach Providervertrag beweisbare Nicht-Annahme darf `rejected`
 * werden. Alles andere bleibt `uncertain` — der Provider könnte den Auftrag
 * angenommen haben und später doch noch callbacken (D3/G3.1b).
 *
 * Ausdrücklich `uncertain`: 408 (Timeout), 409 (Konflikt beweist keine
 * Nicht-Annahme), 429 (Rate-Limit), alle 5xx, Netzwerkabbrüche, unbekannte
 * Antworten.
 */
export function classifyDispatchFailure(err: unknown): "rejected" | "uncertain" {
  const msg = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase();
  // Zuerst die Codes, die niemals kippen dürfen.
  if (/\b(408|409|429|5\d{2})\b/.test(msg)) return "uncertain";
  if (/\b(400|401|403|404|422)\b/.test(msg)) return "rejected";
  if (/missing_run_stamp|invalid_input|validation_failed|invalid_request|unsupported|unauthorized|forbidden|aborted_before_dispatch/.test(msg)) {
    return "rejected";
  }
  return "uncertain";
}


/**
 * Synchron fertige Dispatches (z. B. ai-image, das sofort ein Ergebnis liefert)
 * haben keine externe Job-ID und dürfen nicht als offener Versand zurückbleiben.
 */
export async function completeLedgerJobImmediate(
  admin: any,
  jobId: string | null | undefined,
): Promise<void> {
  if (!jobId) return;
  try {
    await admin
      .from("composer_pipeline_jobs")
      .update({ status: "succeeded", completed_at: new Date().toISOString() })
      .eq("id", jobId)
      .in("status", ["pending", "dispatching"]);
  } catch (e) {
    console.warn(`${V431_OBSERVE_TAG} ledger_complete_failed`, JSON.stringify({
      pipeline_job_id: jobId,
      error: e instanceof Error ? e.message : String(e),
    }));
  }
}

export interface ReplaceLedgerAttemptParams {
  previousJobId: string;
  sceneId: string;
  runId: string;
  stage: PipelineStage;
  plateGeneration: number;
  provider?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * G3.1b — einziger erlaubter Retry-Einstieg.
 *
 * Ablösen des alten Attempts und Anlegen des neuen laufen atomar in EINER
 * Transaktion (`composer_replace_pipeline_attempt`): Row-Lock auf den
 * Vorgänger, Identitäts- und Ablösefähigkeitsprüfung, `stale` + INSERT
 * `attempt_no + 1` — oder gar nichts. Ein konkurrierender Ablöseversuch
 * verliert deterministisch und bekommt `null`; der Verlierer darf dann NICHT
 * dispatchen. Die neue `pipeline_job_id` steht erst nach dem Commit bereit.
 */
export async function replaceLedgerAttempt(
  admin: any,
  params: ReplaceLedgerAttemptParams,
): Promise<LedgerJobHandle | null> {
  try {
    const { data, error } = await admin.rpc("composer_replace_pipeline_attempt", {
      p_previous_job_id: params.previousJobId,
      p_expected_scene_id: params.sceneId,
      p_expected_run_id: params.runId,
      p_expected_stage: params.stage,
      p_expected_plate_generation: params.plateGeneration,
      p_provider: params.provider ?? null,
      p_metadata: params.metadata ?? {},
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row?.job_id) {
      console.warn(`${V431_OBSERVE_TAG} ledger_replace_lost`, JSON.stringify({
        previous_job_id: params.previousJobId,
        scene_id: params.sceneId,
        stage: params.stage,
        error: error?.message ?? "no_row",
      }));
      return null;
    }
    return {
      id: String(row.job_id),
      attemptNo: Number(row.attempt_no ?? 0),
      runId: params.runId,
      plateGeneration: params.plateGeneration,
    };
  } catch (e) {
    console.warn(`${V431_OBSERVE_TAG} ledger_replace_threw`, JSON.stringify({
      previous_job_id: params.previousJobId,
      error: e instanceof Error ? e.message : String(e),
    }));
    return null;
  }
}

/** Extrahiert `pipeline_job_id` aus URL-Query, Body oder Provider-Metadaten. */
export function readPipelineJobId(
  ...sources: Array<URL | Record<string, unknown> | null | undefined>
): string | null {
  for (const src of sources) {
    if (!src) continue;
    const raw = src instanceof URL
      ? src.searchParams.get("pipeline_job_id")
      : (src as Record<string, unknown>)["pipeline_job_id"] ??
        (src as Record<string, unknown>)["pipelineJobId"];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }
  return null;
}

export type ObserveVerdict =
  | "bound"
  /** Job über `pipeline_job_id` eindeutig gefunden, `external_job_id` noch NULL. */
  | "binding_pending"
  | "missing_binding"
  | "job_not_found"
  | "wrong_job"
  | "stale_run"
  | "stale_generation"
  | "observe_error";

export interface ObserveInput {
  pipelineJobId: string | null;
  sceneId: string;
  stage: PipelineStage;
  externalJobId?: string | null;
  /** Callback-seitig gemeldeter Run — bestätigend, nie bestimmend. */
  reportedRunId?: string | null;
  handler: string;
}

export interface ObserveResult {
  verdict: ObserveVerdict;
  jobId: string | null;
  ledgerRunId: string | null;
  ledgerPlateGeneration: number | null;
}

/**
 * G3.1 Observe: liest die Ledger-Bindung eines Callbacks und loggt sie.
 *
 * Schreibt NICHTS — weder Szene noch Job. Das Ergebnis darf in G3.1 von keinem
 * Handler als Entscheidungsgrundlage benutzt werden; es speist ausschließlich
 * das Drain-Gate-Kriterium (0 × `missing_binding` über das Drain-Fenster).
 */
export async function observeCallbackProvenance(
  admin: any,
  input: ObserveInput,
): Promise<ObserveResult> {
  const base: ObserveResult = {
    verdict: "missing_binding",
    jobId: input.pipelineJobId,
    ledgerRunId: null,
    ledgerPlateGeneration: null,
  };

  const emit = (r: ObserveResult, extra?: Record<string, unknown>) => {
    console.log(`${V431_OBSERVE_TAG}`, JSON.stringify({
      handler: input.handler,
      verdict: r.verdict,
      scene_id: input.sceneId,
      stage: input.stage,
      pipeline_job_id: r.jobId,
      ledger_run_id: r.ledgerRunId,
      ledger_plate_generation: r.ledgerPlateGeneration,
      reported_run_id: input.reportedRunId ?? null,
      external_job_id: input.externalJobId ?? null,
      ...(extra ?? {}),
    }));
    return r;
  };

  try {
    if (!input.pipelineJobId) return emit(base);

    const { data: job } = await admin
      .from("composer_pipeline_jobs")
      .select("id, scene_id, run_id, stage, plate_generation, external_job_id, status")
      .eq("id", input.pipelineJobId)
      .maybeSingle();

    if (!job) return emit({ ...base, verdict: "job_not_found" });

    const result: ObserveResult = {
      verdict: "bound",
      jobId: String(job.id),
      ledgerRunId: job.run_id ? String(job.run_id) : null,
      ledgerPlateGeneration:
        typeof job.plate_generation === "number" ? job.plate_generation : null,
    };

    if (String(job.scene_id) !== input.sceneId || String(job.stage) !== input.stage) {
      return emit({ ...result, verdict: "wrong_job" }, {
        ledger_scene_id: job.scene_id,
        ledger_stage: job.stage,
      });
    }
    if (input.externalJobId && !job.external_job_id) {
      // G3.1b: Callback ist schneller als `bindLedgerExternalJob()`. Der Job ist
      // über die `pipeline_job_id` eindeutig — das ist KEIN wrong_job, sondern
      // ein eigener, gezählter Zustand (Datengrundlage der G3.2-Entscheidung).
      return emit({ ...result, verdict: "binding_pending" }, {
        job_status: job.status,
      });
    }
    if (
      input.externalJobId && job.external_job_id &&
      String(job.external_job_id) !== String(input.externalJobId)
    ) {
      return emit({ ...result, verdict: "wrong_job" }, {
        ledger_external_job_id: job.external_job_id,
      });
    }

    const { data: scene } = await admin
      .from("composer_scenes")
      .select("active_run_id, plate_generation")
      .eq("id", input.sceneId)
      .maybeSingle();

    if (scene) {
      if (String(scene.active_run_id ?? "") !== String(result.ledgerRunId ?? "")) {
        return emit({ ...result, verdict: "stale_run" }, {
          scene_active_run_id: scene.active_run_id ?? null,
        });
      }
      if (
        result.ledgerPlateGeneration != null &&
        typeof scene.plate_generation === "number" &&
        scene.plate_generation !== result.ledgerPlateGeneration
      ) {
        return emit({ ...result, verdict: "stale_generation" }, {
          scene_plate_generation: scene.plate_generation,
        });
      }
    }

    return emit(result, { job_status: job.status });
  } catch (e) {
    return emit({ ...base, verdict: "observe_error" }, {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
